"""Upload only validated inference artifacts to the private BANTALA model repo."""
from pathlib import Path
import json
import zipfile
from huggingface_hub import HfApi

HERE = Path(__file__).resolve().parent
SOURCE = Path.home() / 'Downloads'
DEST = HERE / '.local' / 'model-upload'
DEST.mkdir(parents=True, exist_ok=True)
api = HfApi(token=(Path.home() / '.cache/huggingface/token').read_text().strip())
repo = 'Bahababa/bantala-models'
if not api.model_info(repo).private:
    raise RuntimeError('Refusing to upload to a public repository')
archives = {
    'flood': 'drive-download-20260928T025654Z-1-001.zip',
    'severity': 'drive-download-20260928T025742Z-1-001.zip',
    'urgency': 'drive-download-20260928T025751Z-1-001.zip',
    'location': 'checkpoint-286-20260928T025733Z-1-001.zip',
}
allowed = {'config.json', 'model.safetensors', 'tokenizer.json', 'tokenizer_config.json',
           'special_tokens_map.json', 'vocab.txt'}
required = {'config.json', 'model.safetensors', 'tokenizer.json', 'tokenizer_config.json'}
for name, filename in archives.items():
    output = DEST / (name + '.zip')
    if not output.exists():
        print('Preparing inference files: ' + name, flush=True)
        with zipfile.ZipFile(SOURCE / filename) as source:
            entries = {Path(i.filename).name: i for i in source.infolist() if Path(i.filename).name in allowed}
            if not required.issubset(entries):
                raise RuntimeError('Missing inference files: ' + name)
            temporary = output.with_suffix('.tmp')
            with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=1) as target:
                for basename, entry in entries.items():
                    with source.open(entry) as reader, target.open(basename, 'w', force_zip64=True) as writer:
                        while chunk := reader.read(8 * 1024 * 1024):
                            writer.write(chunk)
            temporary.replace(output)
    print('Uploading ' + name + ': ' + str(output.stat().st_size) + ' bytes', flush=True)
    api.upload_file(path_or_fileobj=str(output), path_in_repo=output.name, repo_id=repo,
                    commit_message='Upload validated ' + name + ' inference archive')
    print('Uploaded ' + name, flush=True)
info = api.model_info(repo, files_metadata=True)
print(json.dumps({'private': info.private, 'files': [{'name': f.rfilename, 'size': f.size} for f in info.siblings]}), flush=True)
