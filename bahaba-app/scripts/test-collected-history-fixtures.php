<?php
$pdo=new PDO('mysql:host=127.0.0.1;port=33317;dbname=bahaba_report_actions_test;charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$pdo->exec("SET time_zone='+00:00'");
$stmt=$pdo->prepare("INSERT INTO nlp_events(source,source_post_id,post_text,city,location_id,barangay,classification,severity,urgency,confidence_percent,detected_at,received_at) VALUES('Test',?,'Synthetic collection test','Navotas City','navotas',? ,?,'High','Concerned',90,?,?)");
$now=new DateTimeImmutable('now',new DateTimeZone('UTC'));
for($i=0;$i<205;$i++){$t=$now->modify('-1 hour')->format('Y-m-d H:i:s');$stmt->execute(['live-'.$i,'San Jose','Flood',$t,$t]);}
foreach([['old-1','San Jose','Flood','-2 days'],['old-2','San Jose','Non-Flood','-2 days'],['old-3','Daanghari','Flood','-3 months'],['outside','San Jose','Flood','-14 months']] as [$id,$brgy,$class,$time]){$t=$now->modify($time)->format('Y-m-d H:i:s');$stmt->execute([$id,$brgy,$class,$t,$t]);}
echo "Seeded 205 live posts, three archived posts, and one outside the 12-month range.\n";
