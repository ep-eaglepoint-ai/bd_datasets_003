module tests

go 1.21

require (
	repository_after v0.0.0
	wsconv_gn v0.0.0
)

replace repository_after => /app/repository_after
replace wsconv_gn => /app/repository_before
