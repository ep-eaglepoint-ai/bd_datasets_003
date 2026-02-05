# V3GEA2 - parse_markdown_python

    ## Before Test Docker Command
    docker compose run --rm   -e PARSER_PATH=repository_before  app python -m pytest || true

    ## After Test Docker Command
    docker compose run --rm   -e PARSER_PATH=repository_after  app python -m pytest tests

    ## Evaluation Docker Command
    docker compose run --rm app
    