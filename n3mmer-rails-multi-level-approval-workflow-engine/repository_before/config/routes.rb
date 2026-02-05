Rails.application.routes.draw do
  devise_for :users

  namespace :api do
    resources :organizations, only: [:show]
    resources :departments, only: [:index, :show]
    resources :users, only: [:index, :show]
    
    resources :purchase_orders do
      member do
        post :submit
      end
    end
    
    resources :expense_reports do
      member do
        post :submit
      end
    end
  end

  require 'sidekiq/web'
  mount Sidekiq::Web => '/sidekiq'
end
