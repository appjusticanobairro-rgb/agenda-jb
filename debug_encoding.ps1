$path = "c:\Users\JB\Desktop\Arquivos da Agenda NOVA\script.js"
$bytes = [System.IO.File]::ReadAllBytes($path)

# Search for "Hor"
$target = @(72, 111, 114) # H-o-r
for ($i=0; $i -lt $bytes.Length - 20; $i++) {
    if ($bytes[$i] -eq 72 -and $bytes[$i+1] -eq 111 -and $bytes[$i+2] -eq 114) {
        $sub = $bytes[$i..($i+15)]
        $hex = $sub | ForEach-Object { "{0:X2}" -f $_ }
        Write-Host ("Match for 'Hor...' at index $i : " + ($hex -join " "))
        break
    }
}

# Search for " n" as in " no"
for ($i=0; $i -lt $bytes.Length - 10; $i++) {
    if ($bytes[$i] -eq 32 -and $bytes[$i+1] -eq 110 -and $bytes[$i+2] -eq 0xEF) {
        $sub = $bytes[$i..($i+10)]
        $hex = $sub | ForEach-Object { "{0:X2}" -f $_ }
        Write-Host ("Match for ' n...' at index $i : " + ($hex -join " "))
        break
    }
}
