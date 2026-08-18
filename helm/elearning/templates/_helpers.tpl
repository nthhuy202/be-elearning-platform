{{/*
Tag ưu tiên values.image.tag; rỗng thì lấy appVersion trong Chart.yaml.
File bắt đầu bằng _ không được Helm coi là manifest, chỉ là thư viện hàm.
*/}}
{{- define "elearning.image" -}}
{{ printf "%s:%s" .Values.image.repository (.Values.image.tag | default .Chart.AppVersion) }}
{{- end -}}