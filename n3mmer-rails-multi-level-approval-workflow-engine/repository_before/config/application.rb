require_relative 'boot'
require 'rails/all'

Bundler.require(*Rails.groups)

module ErpApp
  class Application < Rails::Application
    config.load_defaults 7.1
    config.api_only = true
    config.active_job.queue_adapter = :sidekiq
  end
end
