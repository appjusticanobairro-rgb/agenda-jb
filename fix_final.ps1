$files = @(
    "c:\Users\JB\Desktop\Arquivos da Agenda NOVA\script.js",
    "c:\Users\JB\Desktop\Arquivos da Agenda NOVA\index.html"
)

# Common corrupted sequences: EF BE 83 EF BD XX -> C3 YY
# Where YY is the Latin-1 byte (XX).
$map = @{
    "EFBE83EFBDA7" = "C3A7" # ç
    "EFBE83EFBDA1" = "C3A1" # á
    "EFBE83EFBDAD" = "C3AD" # í
    "EFBE83EFBDB3" = "C3B3" # ó
    "EFBE83EFBDAA" = "C3AA" # ê
    "EFBE83EFBDB5" = "C3B5" # õ
    "EFBE83EFBDA9" = "C3A9" # é
    "EFBE83EFBDA3" = "C3A3" # ã
    "EFBE83EFBDBA" = "C3BA" # ú
    "EFBE83EFBDA2" = "C3A2" # â
    "EFBE83EFBDA0" = "C3A0" # à
    "EFBE83EFBD81" = "C381" # Á
    "EFBE83EFBD80" = "C380" # À
    "EFBE83EFBD82" = "C382" # Â
}

foreach ($f in $files) {
    if (Test-Path $f) {
        Write-Host "Fixing $f..."
        $bytes = [System.IO.File]::ReadAllBytes($f)
        $hex = [System.BitConverter]::ToString($bytes) -replace '-'
        
        foreach ($key in $map.Keys) {
            $hex = $hex -replace $key, $map[$key]
        }
        
        # Convert hex back to bytes
        $newBytes = [byte[]]($hex -split '(?<=\G..)(?=.)' | ForEach-Object { [System.Convert]::ToByte($_, 16) })
        [System.IO.File]::WriteAllBytes($f, $newBytes)
    }
}
Write-Host "Byte-level fix complete!"
