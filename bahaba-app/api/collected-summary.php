<?php
// Raw collector records stay intact. The 24-hour boundary changes presentation,
// so retries cannot double count a separate archive or discard source evidence.
function bahaba_collected_rows(PDO $pdo, string $location, string $barangay = '', ?int $year = null): array {
    $pdo->exec("SET time_zone = '+00:00'");
    $now = new DateTimeImmutable('now', new DateTimeZone('Asia/Manila'));
    $start = $year ? $now->setDate($year, 1, 1)->setTime(0,0) : $now->modify('first day of this month')->setTime(0,0)->modify('-11 months');
    $end = $year ? $start->modify('+1 year') : $now->modify('first day of next month')->setTime(0,0);
    $params=[$location,$start->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s'),$end->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s')];
    $scope=$barangay!==''?' AND barangay=?':'';if($barangay!=='')$params[]=$barangay;
    $stmt=$pdo->prepare("SELECT DATE_FORMAT(CONVERT_TZ(received_at,'+00:00','+08:00'),'%Y-%m-01') AS report_month,
        COALESCE(NULLIF(barangay,''),'Unmapped barangay') AS barangay, source, classification, severity, urgency,
        COUNT(*) AS total, AVG(confidence_percent) AS average_confidence
        FROM nlp_events WHERE location_id=? AND received_at>=? AND received_at<?
        AND received_at < UTC_TIMESTAMP() - INTERVAL 24 HOUR $scope
        GROUP BY report_month,barangay,source,classification,severity,urgency ORDER BY report_month,barangay,source");
    $stmt->execute($params);return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function bahaba_collected_rollup(array $rows, bool $yearly=false): array {
    $groups=[];
    foreach($rows as $row){
        $period=substr($row['report_month'],0,$yearly?4:7);$key=$period.'|'.$row['barangay'];
        if(!isset($groups[$key]))$groups[$key]=['period'=>$period,'barangay'=>$row['barangay'],'total'=>0,'flood'=>0,'non_flood'=>0,'high'=>0,'medium'=>0,'low'=>0];
        $g=&$groups[$key];$n=(int)$row['total'];$g['total']+=$n;
        if($row['classification']==='Flood'){$g['flood']+=$n;$severity=strtolower($row['severity']);if($severity==='mid')$severity='medium';if(in_array($severity,['high','medium','low'],true))$g[$severity]+=$n;}
        else $g['non_flood']+=$n;
        unset($g);
    }
    return array_values($groups);
}

// Minimal real XLSX workbook: inline strings prevent spreadsheet formula injection.
function bahaba_collected_xlsx(array $sheets): string {
    if(!class_exists('ZipArchive'))throw new RuntimeException('Enable the PHP ZIP extension to export Excel workbooks.');
    $file=tempnam(sys_get_temp_dir(),'bahaba-xlsx-');$zip=new ZipArchive();
    try {
        if($zip->open($file,ZipArchive::OVERWRITE)!==true)throw new RuntimeException('Cannot create workbook.');
        $xml=static fn($v)=>htmlspecialchars((string)$v,ENT_XML1|ENT_QUOTES,'UTF-8');
        $types='';$book='';$rels='';$i=0;
        foreach($sheets as $name=>$rows){$i++;$types.='<Override PartName="/xl/worksheets/sheet'.$i.'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
            $book.='<sheet name="'.$xml($name).'" sheetId="'.$i.'" r:id="rId'.$i.'"/>';
            $rels.='<Relationship Id="rId'.$i.'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'.$i.'.xml"/>';
            $sheet='<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
            foreach($rows as $index=>$row){$sheet.='<row r="'.($index+1).'">';foreach(array_values($row) as $col=>$value){$letters='';for($c=$col+1;$c>0;$c=intdiv($c-1,26))$letters=chr(65+($c-1)%26).$letters;$ref=$letters.($index+1);$sheet.=is_int($value)||is_float($value)?'<c r="'.$ref.'"><v>'.$value.'</v></c>':'<c r="'.$ref.'" t="inlineStr"><is><t xml:space="preserve">'.$xml($value).'</t></is></c>';}$sheet.='</row>';}
            $zip->addFromString('xl/worksheets/sheet'.$i.'.xml',$sheet.'</sheetData></worksheet>');
        }
        $zip->addFromString('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'.$types.'</Types>');
        $zip->addFromString('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
        $zip->addFromString('xl/workbook.xml','<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'.$book.'</sheets></workbook>');
        $zip->addFromString('xl/_rels/workbook.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'.$rels.'</Relationships>');
        $zip->close();return file_get_contents($file);
    }finally{if(is_file($file))unlink($file);}
}
