Rails.application.routes.draw do

  concern :commentable do
    resources :comments
  end

  concern :image_attachable do
    resources :images, only: :index
  end

  resources :messages, concerns: :commentable

  resources :articles, concerns: [:commentable, :image_attachable]



  # devise_for :candidates
  devise_for :candidates , controllers: {
      sessions: 'candidates/sessions',
      registrations: 'candidates/registrations',
      passwords:'candidates/passwords',
      invitations: 'candidate/invitations'
  }


  get '/states/:country', to: 'application#states'
  get '/cities/:state/:country', to: 'application#cities'

  concern :paginatable do
    get '(page/:page)', action: :index, on: :collection, as: ''
    match :search, action: :index, via: [:get , :post], on: :collection
  end

  namespace :static do
    resources :jobs ,  only: [:index,:show] do
      get '(page/:page)', action: :index, on: :collection, as: ''
      match :search, action: :index, via: [:get , :post], on: :collection
      post :apply
      resources :job_applications ,only:[:create]
    end
    resources :candidates  do
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

  get 'register' => 'companies#new'
  get  'signin' ,to: 'static#signin'
  post 'signin' ,to: 'static#signin'

  # COMPANY ROUTES
  namespace  :company do
    get 'companies/edit'
    resources :users, only: [:show,:update] do
      collection do
        get :notify_notifications
      end
    end
    resources :companies ,only: [:create]
    resources :candidates , only: [:create]
  end

  scope module: :company do

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
    resources :groups           ,concerns: :paginatable
    resources :admins           ,concerns: :paginatable , only: [:index , :create , :new]
    resources :addresses
    resources :directories      ,only: [:index]
    resources :comments         , only: [:create]
    resources :attachments      ,concerns: :paginatable , only: [:index]
    resources :invoices         ,concerns: :paginatable , only: [:index]
    resources :job_invitations  ,concerns: :paginatable , only: [:index , :show]
    resources :candidates   ,concerns: :paginatable ,only: [:new ,:index,:show] do
    match  :manage_groups , via: [:get, :patch]
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
    resources :contracts        ,concerns: :paginatable , only: [:index ,:show , :new , :create] do
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
    get 'attachment/documents_list',to: 'attachments#document_list'
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
      collection do
        post :change_owner
        post :get_admins_list , as: :get_admins_list
        post :update_logo
      end
    end

  end # End of module company

  resources :companies , only: [:new , :create,:update] do
    member do
      get :profile
    end
  end
  resources :static , only: [:index]

  # Devise Routes
   devise_for :users, controllers: { invitations: 'company/invitations', passwords: 'users/passwords',sessions: 'users/sessions' } , path_names: { sign_in: 'login', sign_out: 'logout'}

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


end
