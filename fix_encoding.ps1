$files = @(
    "c:\Users\JB\Desktop\Arquivos da Agenda NOVA\script.js",
    "c:\Users\JB\Desktop\Arquivos da Agenda NOVA\index.html"
)

# Mojibake Map (Common double-encoding artifacts)
$map = @{
    "Ã§" = "ç"
    "Ã¡" = "á"
    "Ã­" = "í"
    "Ã³" = "ó"
    "Ãª" = "ê"
    "Ãµ" = "õ"
    "Ã©" = "é"
    "Ã£" = "ã"
    "Ãº" = "ú"
    "Ã" + [char]0x81 = "Á"
    "Ã€" = "À"
    "Ã‚" = "Â"
}

foreach ($f in $files) {
    if (Test-Path $f) {
        Write-Host "Fixing $f..."
        $content = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
        foreach ($key in $map.Keys) {
            $content = $content.Replace($key, $map[$key])
        }
        [System.IO.File]::WriteAllText($f, $content, [System.Text.Encoding]::UTF8)
    }
}
Write-Host "Encoding fix complete!"
