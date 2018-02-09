Rails.application.routes.draw do

  namespace :company do
    get 'activities/index'
  end

  mount ActionCable.server => '/cable'

  concern :commentable do
    resources :comments
  end

  concern :image_attachable do
    resources :images, only: :index
  end

  resources :messages, concerns: :commentable
  resources :articles, concerns: [:commentable, :image_attachable]


  get '/states/:country', to: 'application#states'
  get '/cities/:state/:country', to: 'application#cities'
  get 'register' => 'companies#new'
  get  'signin' ,to: 'static#signin'
  post 'signin' ,to: 'static#signin'
  get 'signup' ,to: 'static#signup'

  concern :paginatable do
    get '(page/:page)', action: :index, on: :collection, as: ''
    match :search, action: :index, via: [:get , :post], on: :collection
  end

  resources :static , only: [:index]
  namespace :static do
    resources :jobs ,  only: [:index,:show] do
      get '(page/:page)', action: :index, on: :collection, as: ''
      match :search, action: :index, via: [:get , :post], on: :collection
      post :apply
      resources :job_applications ,only:[:create]
    end
    resources :companies , only: [] do
      resources :candidates  do
        get :resume
      end
    end
    resources :candidates  do
      post :send_message
      get :resume
    end
  end


  scope module: :candidate do

    resources :candidates ,path: :candidate ,only: [:update] do
      collection do
        get :notify_notifications
        post :upload_resume
      end
    end
    resources  :portfolios ,only: [:create,:update]
    resources :chats , only:[:show] do
      resources :messages ,only: [:create] do
        collection do
          post :file_message ,as: :candidate_file
          post :render_message
        end

        # match :share_message ,via: [:get , :post]

      end
    end
    get '/profile',to:'candidates#show'

  end


  namespace :candidate do

    post 'update_photo',    to: 'candidates#update_photo'
    resources :educations, only:[:create,:update]
    resources :experiences, only: [:create,:update]
    get '/' ,       to: 'candidates#dashboard' ,             as: :candidate_dashboard
    resources :addresses,only: [:update]

    resources :job_applications , only: [:index,:show]
    resources :job_invitations , only: [:index , :show] do
      post :reject
      get  :show_invitation
    end
    # resources :contracts        , only: [:index]
    resources :candidates ,only: [:show,:update]
    resources :jobs do
      # resources :contracts , except: [:index] do
      #   member do
      #     post :open_contract , as: :open_contract
      #     post :update_contract_response        , as: :update_contract_response
      #   end # End of member
      # end # End of :contracts

      resources :job_applications
      member do
        post :apply
      end #end of member
    end # End of jobs

    resources :conversations do
      get :search, on: :collection
      resources :conversation_messages
    end
  end


  class NakedEtymeDomain
    def self.matches?(request)
      (request.subdomain.blank? || request.subdomain == 'www') #&& request.domain == ENV['domain']
    end
  end

  class Subdomain
    def self.matches?(request)
      request.subdomain.present? && request.subdomain != 'www' && request.subdomain != 'app-etyme'
    end
  end

  # COMPANY ROUTES
  namespace  :company do

    resources :statuses , only: [:create,:index] do
      collection do
        post :create_bulk_candidates
        post :create_bulk_companies
      end
    end
    get 'companies/edit'
    resources :users, only: [:show,:update] do
      get  :add_reminder
      match  :assign_groups , via: [:get , :post]
      get :profile
      collection do
        get :notify_notifications

      end
    end
    resources :companies ,only: [:create , :update] do
      get    :add_reminder
      match  :assign_groups , via: [:get , :post]
      post   :add_to_network
      get    :hot_candidates
      get    :hot_index
      match :create_chat ,via: [:get, :post]
    end
    resources :candidates

    resources :chats  , only: [:show] do
      post :add_users
      resources :messages  ,only: [:create] do
        collection do
          post :render_message
          post :file_message
        end
        match :share_message ,via: [:get , :post]
      end
    end

    resources :bench_jobs, only: [:index, :destroy]
    resources :job_receives, only: [:index, :destroy]
    resources :public_jobs, only: [:index, :destroy] do
      get :job, on: :member
    end

    resources :conversations do
      get :search, on: :collection
      resources :conversation_messages do
        get :mark_as_read, on: :member
      end
    end

    resources :sell_contracts
    resources :buy_contracts

  end

  scope module: :company do

    resources :activities ,only: [:index]

    post 'reject_vendor' ,to: 'prefer_vendors#reject'
    post 'accept_vendor' ,to: 'prefer_vendors#accept'
    get  'network',       to:   'prefer_vendors#show_network'
    # get  'hot_candidate', to: 'companies#hot_candidate'

    resources :consultants , concerns: :paginatable do
      resources :leaves do
        member do
          post :accept
          post :reject
        end
      end
    end
    resources :locations
    resources :company_docs
    resources :roles
    resources :groups           ,concerns: :paginatable do
      collection do
        post :create_bulk_candidates
        post :create_bulk_companies
      end
    end
    resources :admins           ,concerns: :paginatable
    resources :addresses
    resources :directories      ,only: [:index]
    resources :comments         , only: [:create]
    resources :attachments      ,concerns: :paginatable , only: [:index]
    resources :invoices         ,concerns: :paginatable , only: [:index]
    resources :reminders        ,only: :create do
      collection do
        post :create_bulk_candidates
        post :create_bulk_companies
      end
    end
    resources :prefer_vendors   ,concerns: :paginatable  do
      # end
    end
    resources :job_invitations  ,concerns: :paginatable , only: [:index , :show]
    resources :candidates   ,concerns: :paginatable,only: :index do
      match  :manage_groups , via: [:get, :patch]
      post   :make_hot
      post   :make_normal
      get    :add_reminder
      get    :assign_status
      post   :create_chat
      collection do
        get    :share_candidates ,as: :share_hot_candidates
      end

    end
    resources :job_applications ,concerns: :paginatable , only: [:index,:show] do
    resources :consultants , only: [:new , :create]
      member do
        get :share
        post :share_application_with_companies
        post :accept
        post :reject
        post :short_list
        post :interview
        post :hire
      end # End of member
    end
    resources :contracts        ,concerns: :paginatable , except:[:destroy] do
      resources :contracts
      collection do
        post :nested_create
      end
      member do
        post :update_attachable_doc
      end
      post :change_invoice_date
      resources :invoices , only: [:index , :show] do
        member do
          get :download
          post :accept_invoice
          post :reject_invoice
        end
      end
    end

    resources :jobs , concerns: :paginatable do

      match 'create_multiple_for_candidate',    to: 'job_applications#create_multiple_For_candidate', via: [:get, :post]

      resources :contracts , except: [:index , :show] do
        member do
          post :open_contract , as: :open_contract
          post :update_contract_response        , as: :update_contract_response
          post :create_sub_contract             , as: :create_sub_contract
        end
      end # End of :contracts

      resources :job_invitations , except: [:index] do
        collection do
          post :import
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
    # get 'attachment/documents_list',to: 'attachments#document_list'
    get 'dashboard' ,       to: 'users#dashboard' ,             as: :dashboard
    post 'update_photo',    to: 'users#update_photo'
    resources :timesheets ,concerns: :paginatable , only: [:show , :index] do
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
    resources :companies , concerns: :paginatable ,only: [:update,:show , :index,:edit,:destroy] do
      get  :contacts
      get  :assign_status
      collection do
        post :change_owner
        post :get_admins_list , as: :get_admins_list
        post :update_logo
      end
    end

  end # End of module company

  resources :companies , only: [:create,:update] do
    member do
      get :profile
    end
  end


  # Devise Routes
  devise_for :users, controllers: { invitations: 'company/invitations', passwords: 'users/passwords', sessions: 'users/sessions', confirmations: 'users/confirmations' } , path_names: { sign_in: 'login', sign_out: 'logout'}

  # devise_for :candidates
  devise_for :candidates , controllers: {
      sessions: 'candidates/sessions',
      registrations: 'candidates/registrations',
      passwords:'candidates/passwords',
      confirmations: 'candidates/confirmations',
      invitations: 'candidate/invitations'
  }
  # Route set when subdomain present?
  constraints(Subdomain) do
    devise_scope :user do
      match '/' => 'devise/sessions#new', via: [:get, :post]
    end
  end

  # Route set when subdomain is not present
  constraints(NakedEtymeDomain) do
    match '/'  => "static#index", via: [:get, :post]
  end

  namespace :api do
    resources :select_searches, only: :index do
      get :find_companies, on: :collection
      get :find_job_applicants, on: :collection
      get :find_user_sign, on: :collection
    end
  end

  resources :conversations do
    resources :conversation_messages do
      get :mark_as_read, on: :member
    end
  end
  root 'static#index'

end
