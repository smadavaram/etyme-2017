# == Route Map
#
#                   Prefix Verb   URI Pattern                    Controller#Action
#                companies GET    /companies(.:format)           companies#index
#                          POST   /companies(.:format)           companies#create
#              new_company GET    /companies/new(.:format)       companies#new
#             edit_company GET    /companies/:id/edit(.:format)  companies#edit
#                  company GET    /companies/:id(.:format)       companies#show
#                          PATCH  /companies/:id(.:format)       companies#update
#                          PUT    /companies/:id(.:format)       companies#update
#                          DELETE /companies/:id(.:format)       companies#destroy
#                 register GET    /register(.:format)            companies#new
#                     root GET    /                              static#index
#      dashboard_companies GET    /companies/dashboard(.:format) company/companies#dashboard
#                          GET    /companies(.:format)           company/companies#index
#                          POST   /companies(.:format)           company/companies#create
#                          GET    /companies/new(.:format)       company/companies#new
#                          GET    /companies/:id/edit(.:format)  company/companies#edit
#                          GET    /companies/:id(.:format)       company/companies#show
#                          PATCH  /companies/:id(.:format)       company/companies#update
#                          PUT    /companies/:id(.:format)       company/companies#update
#                          DELETE /companies/:id(.:format)       company/companies#destroy
#         new_user_session GET    /login(.:format)               devise/sessions#new
#             user_session POST   /login(.:format)               devise/sessions#create
#     destroy_user_session DELETE /logout(.:format)              devise/sessions#destroy
#            user_password POST   /password(.:format)            devise/passwords#create
#        new_user_password GET    /password/new(.:format)        devise/passwords#new
#       edit_user_password GET    /password/edit(.:format)       devise/passwords#edit
#                          PATCH  /password(.:format)            devise/passwords#update
#                          PUT    /password(.:format)            devise/passwords#update
# cancel_user_registration GET    /cancel(.:format)              devise/registrations#cancel
#        user_registration POST   /                              devise/registrations#create
#    new_user_registration GET    /sign_up(.:format)             devise/registrations#new
#   edit_user_registration GET    /edit(.:format)                devise/registrations#edit
#                          PATCH  /                              devise/registrations#update
#                          PUT    /                              devise/registrations#update
#                          DELETE /                              devise/registrations#destroy
#        user_confirmation POST   /confirmation(.:format)        devise/confirmations#create
#    new_user_confirmation GET    /confirmation/new(.:format)    devise/confirmations#new
#                          GET    /confirmation(.:format)        devise/confirmations#show
#

Rails.application.routes.draw do


  class NakedEtymeDomain
    def self.matches?(request)
      (request.subdomain.blank? || request.subdomain == 'www') #&& request.domain == ENV['etyme_domain']
    end
  end

  class Subdomain
    def self.matches?(request)
      request.subdomain.present? && request.subdomain != 'www' && request.subdomain != 'staging'
    end
  end



  get 'register' => 'companies#new'

  scope module: :company do
    resources :employees

    get 'dashboard' , to: 'users#dashboard' , as: :dashboard

    # AJAX for layout setting, remove in future
    get 'ajax/email_compose', to: 'ajax#email_compose', as: :ajax_email_compose
    get 'ajax/email_list', to: 'ajax#email_list', as: :ajax_email_list
    get 'ajax/email_opened', to: 'ajax#email_opened', as: :ajax_email_opened
    get 'ajax/email_reply', to: 'ajax#email_reply', as: :ajax_email_reply
    get 'ajax/demo_widget', to: 'ajax#demo_widget', as: :ajax_demo_widget
    get 'ajax/data_list.json', to: 'ajax#data_list', as: :ajax_data_list
    get 'ajax/notify_mail', to: 'ajax#notify_mail', as: :ajax_notify_mail
    get 'ajax/notify_notifications', to: 'ajax#notify_notifications', as: :ajax_notify_notifications
    get 'company/ajax/notify_tasks', to: 'ajax#notify_tasks', as: :ajax_notify_tasks

  end # End of module company


  # devise_for :devise
  # devise_for :users, path: '', path_names: { sign_in: 'login', sign_out: 'logout'}



  # The priority is based upon order of creation: first created -> highest priority.
  # See how all your routes lay out with "rake routes".

  # Example of regular route:
  #   get 'products/:id' => 'catalog#view'

  # Example of named route that can be invoked with purchase_url(id: product.id)
  #   get 'products/:id/purchase' => 'catalog#purchase', as: :purchase

  # Example resource route (maps HTTP verbs to controller actions automatically):
  #   resources :products

  # Example resource route with options:
  #   resources :products do
  #     member do
  #       get 'short'
  #       post 'toggle'
  #     end
  #
  #     collection do
  #       get 'sold'
  #     end
  #   end

  # Example resource route with sub-resources:
  #   resources :products do
  #     resources :comments, :sales
  #     resource :seller
  #   end

  # Example resource route with more complex sub-resources:
  #   resources :products do
  #     resources :comments
  #     resources :sales do
  #       get 'recent', on: :collection
  #     end
  #   end

  # Example resource route with concerns:
  #   concern :toggleable do
  #     post 'toggle'
  #   end
  #   resources :posts, concerns: :toggleable
  #   resources :photos, concerns: :toggleable

  # Example resource route within a namespace:
  #   namespace :admin do
  #     # Directs /admin/products/* to Admin::ProductsController
  #     # (app/controllers/admin/products_controller.rb)
  #     resources :products
  #   end


  resources :companies , only: [:new , :create]
  resources :static , only: [:index]
  devise_for :users, :controllers => { :invitations => 'company/invitations' }

  # Route set when subdomain present?
  constraints(Subdomain) do
    devise_scope :user do
      match '/' => 'devise/sessions#new', via: [:get, :post]
    end
  end

  # Route set when subdomain is not present
  constraints(NakedEtymeDomain) do
    root :to => "static#index"
  end


end
