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

  get '/states/:country', to: 'application#states'
  get '/cities/:state/:country', to: 'application#cities'
  scope module: :candidate do

    resources :candidates ,path: :candidate ,only: [:update]
    get '/profile',to:'candidates#show'
    get 'candidate/candidates/notify_notifications', to: 'candidates#notify_notifications', as: :candidate_ajax_notify_notifications
  end


  namespace :candidate do
    get '/' ,       to: 'candidates#dashboard' ,             as: :candidate_dashboard
    resources :addresses,only: [:update]

    resources :job_applications , only: [:index,:show]
    resources :job_invitations , only: [:index] do
      post :reject
      get  :show_invitation
    end
    resources :contracts        , only: [:index]
    resources :candidates ,only: [:show,:update]
    resources :jobs do

      resources :contracts , except: [:index] do
        member do
          post :open_contract , as: :open_contract
          post :update_contract_response        , as: :update_contract_response
        end # End of member
      end # End of :contracts

      resources :job_applications
      member do
        post :apply
      end #end of member
    end # End of jobs
  end


  # devise_for :candidates
  namespace :company do
  get 'companies/edit'
  end

  class NakedEtymeDomain
    def self.matches?(request)
      (request.subdomain.blank? || request.subdomain == 'www') && request.domain == ENV['domain']
    end
  end

  class Subdomain
    def self.matches?(request)
      request.subdomain.present? && request.subdomain != 'www' && request.subdomain != 'app-etyme'
    end
  end

  get 'register' => 'companies#new'
  get  'signin' ,to: 'static#signin'
  post 'signin' ,to: 'static#signin'
  # get '/consultants/invitation/accept', to: 'company/invitations#edit', as: :accept_consultant_invitation
  # post '/consultants/invitation/accept', to: 'company/invitations#create', as: :consultant_invitation
  # patch '/consultants/invitation/accept', to: 'company/invitations#update'

  # COMPANY ROUTES
  scope module: :company do

    resources :consultants do
      resources :leaves do
        member do
          post :accept
          post :reject
        end #end of member
      end #end of leaves
    end  #end of consultants
    resources :locations
    resources :company_docs
    resources :roles
    resources :admins
    resources :addresses
    resources :attachments      , only: [:index]
    resources :invoices         , only: [:index]
    resources :job_invitations  , only: [:index]
    resources :job_applications , only: [:index,:show] do
      member do
        post :accept
        post :reject
        post :short_list
        post :interview
        post :hire
      end # End of member
    end
    resources :contracts        , only: [:index ,:show , :new] do
      member do
        post :update_attachable_doc
      end
      post :change_invoice_date
      resources :invoices , only: [:index , :show] do
        member do
          get :download
        end
      end
    end
    resources :jobs do
      resources :contracts , except: [:index , :show] do
        member do
          post :open_contract , as: :open_contract
          post :update_contract_response        , as: :update_contract_response
        end

      end # End of :contracts

      resources :job_invitations , except: [:index] do
        collection do
          post :create_multiple
        end
        resources :job_applications , except: [:index]
        member do
          post :accept
          post :reject
        end # End of member
      end # End of :job_invitations

      member do
        post :send_invitation , as: :send_invitation
      end
    end

    #leaves path for owner of company
    get 'leaves',            to: 'leaves#employees_leaves'      , as: :employees_leaves
    get 'attachment/documents_list',to: 'attachments#document_list'
    get 'dashboard' ,       to: 'users#dashboard' ,             as: :dashboard
    post 'update_photo',    to: 'users#update_photo'
    resources :timesheets,only: [:show , :index] do
      get 'approve'
      get 'submit'
      get 'reject'
      resources :timesheet_logs , only:[:show] do
        get 'approve'
        resources :transactions , only:[:create] do
          post 'accept'
          post 'reject'
        end
      end

    end
    # get 'configuration' ,   to: 'companies#edit' ,              as: :configuration
    resources :companies , only: [:update,:show] do
      collection do
        post :change_owner
        post :get_admins_list , as: :get_admins_list
      end
    end

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


  resources :companies , only: [:new , :create,:update]
  resources :static , only: [:index]

  # Devise Routes
  devise_for :users, controllers: { invitations: 'company/invitations' } , path_names: { sign_in: 'login', sign_out: 'logout'}
  devise_for :candidates , controllers: {
                            sessions: 'candidates/sessions',
                            registrations: 'candidates/registrations',
                            password:'candidates/passwords'
                        }

  # Route set when subdomain present?
  constraints(Subdomain) do
    devise_scope :user do
      match '/' => 'devise/sessions#new', via: [:get, :post]
    end
  end

  # Route set when subdomain is not present
  constraints(NakedEtymeDomain) do
    root :to => "companies#new"
  end


end
