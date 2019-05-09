Rails.application.routes.draw do

  namespace :company do
    get 'activities/index'
  end

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
  get 'signin', to: 'static#signin'
  post 'signin', to: 'static#signin'
  get 'signup', to: 'static#signup'
  get 'domain_suggestion', to: 'static#domain_suggestion'


  namespace :feed do
    get 'job_feed' => 'rss_jobs#job_feed', format: 'rss'
    get 'product_feed' => 'rss_jobs#product_feed', format: 'rss'
    get 'service_feed' => 'rss_jobs#service_feed', format: 'rss'
    get 'training_feed' => 'rss_jobs#training_feed', format: 'rss'
    get 'feeds' => 'rss_jobs#feeds'
    get ':company_id/job_feed' => 'rss_jobs#job_feed', format: 'json'
    get ':company_id/job_feed/:job_id' => 'rss_jobs#job_feed', format: 'json'
    get ':company_id/product_feed' => 'rss_jobs#product_feed', format: 'json'
    get ':company_id/service_feed' => 'rss_jobs#service_feed', format: 'json'
    get ':company_id/training_feed' => 'rss_jobs#training_feed', format: 'json'
  end


  concern :paginatable do
    get '(page/:page)', action: :index, on: :collection, as: ''
    match :search, action: :index, via: [:get, :post], on: :collection
  end

  resources :static, only: [:index]
  namespace :static do
    resources :jobs, only: [:index, :show] do
      get '(page/:page)', action: :index, on: :collection, as: ''
      match :search, action: :index, via: [:get, :post], on: :collection
      post :apply
      resources :job_applications, only: [:create]
      # get 'job_appication_without_registeration' ,to: 'job_applications#job_appication_without_registeration'
      post :job_appication_without_registeration
      post :job_appication_with_recruiter

      # post :import_job
    end
    resources :companies, only: [] do
      resources :candidates do
        get :resume
      end
    end
    resources :candidates do
      post :send_message
      get :resume
    end
  end


  scope module: :candidate do

    resources :candidates, path: :candidate, only: [:update] do
      collection do
        get :notify_notifications
        post :upload_resume
        post :update_video
        post :get_sub_category
        get :edit_educations
        get :edit_skills
        get :edit_client_info
        get :edit_designate
      end
    end
    resources :portfolios, only: [:create, :update]
    resources :benchs, only: [:index] do
      get :accept_bench, on: :member
      get :job, on: :member
      get :candidate_bench_job, on: :collection
      get :candidate_company_info, on: :collection
      get :batch_job, on: :member
      post :apply, on: :member
    end
    resources :chats, only: [:show] do
      resources :messages, only: [:create] do
        collection do
          post :file_message, as: :candidate_file
          post :render_message
        end

        # match :share_message ,via: [:get , :post]

      end
    end
    get '/profile', to: 'candidates#show'

    get '/my_profile', to: 'candidates#my_profile'
    get '/onboarding_profile', to: 'candidates#onboarding_profile'


  end


  namespace :candidate do

    post 'update_photo', to: 'candidates#update_photo'
    delete 'delete_resume', to: 'candidates#delete_resume'
    get 'make_primary_resume', to: 'candidates#make_primary_resume'
    post 'update_mobile_number', to: 'candidates#update_mobile_number'

    resources :public_jobs, only: [:index, :destroy] do
      get :job, on: :member
      get :apply_job_candidate, on: :member
      post :create_batch_job, on: :member
      post :create_own_job, on: :member
      post :apply, on: :member
    end

    resources :educations, only: [:create, :update]
    resources :experiences, only: [:create, :update]
    get '/', to: 'candidates#dashboard', as: :candidate_dashboard
    resources :addresses, only: [:update]

    resources :job_applications, only: [:index, :show]
    resources :job_invitations, only: [:index, :show] do
      post :reject
      get :show_invitation
    end
    # resources :contracts        , only: [:index]
    resources :candidates, only: [:show, :update, :create] do
      get 'current_status', on: :collection
      get 'status_update', on: :collection
      get 'chat_status_update', on: :collection

    end
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
      get :add_to_favourite, on: :collection
      get :remove_from_favourite, on: :collection
      resources :conversation_messages
    end

    resources :contracts, only: [:index] do
      collection do
        get :timeline
      end
    end
    resources :timesheets, only: [:index, :new, :create, :update] do
      post :get_timesheets, on: :collection
      get :submitted_timesheets, on: :collection
      get :approve_timesheets, on: :collection
    end
    resources :client_expenses, only: [:index, :update] do
      post :get_client_expenses, on: :collection
      get :submitted_client_expenses, on: :collection
      get :approve_client_expense, on: :collection
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
  namespace :company do
    resources :departments, only: [:create, :update]
    resources :black_listers, only: [] do
      post 'ban/:black_lister_id/type/:black_lister_type',to: 'black_listers#ban',as: :ban,on: :collection
      post 'unban/:black_lister_id/type/:black_lister_type',to: 'black_listers#unban',as: :unban,on: :collection
    end
    resources :statuses, only: [:create, :index] do
      collection do
        post :create_bulk_candidates
        post :create_bulk_companies
        post :create_bulk_contacts
      end
    end
    post 'update_mobile_number', to: 'companies#update_mobile_number'

    get 'companies/edit'
    resources :users, only: [:show, :update, :destroy] do

      collection do
        get 'current_status'
        get 'status_update'
        get 'chat_status_update'
        get :add_reminder
      end

      match :assign_groups, via: [:get, :post]
      get :profile
      post :update_video
      collection do
        get :notify_notifications

      end
    end

    resources :company_contacts, only: [:index, :new, :create, :destroy]

    resources :companies, only: [:new, :create, :update] do
      get :add_reminder
      match :assign_groups, via: [:get, :post]
      match :assign_groups_to_contact, via: [:get, :post]

      post :verify_website
      get :download_template
      post :add_to_network
      get :hot_candidates
      get :network_contacts, on: :collection
      get :company_contacts, on: :collection
      get :hot_index
      match :create_chat, via: [:get, :post]
    end
    resources :candidates do
      member do
        put :company_candidate, as: :make
      end
    end

    get 'new_candidate_to_bench', to: 'candidates#new_candidate_to_bench'
    # get :new_candidate_to_banch

    resources :chats, only: [:show] do
      post :add_users
      resources :messages, only: [:create] do
        collection do
          post :render_message
          post :file_message
        end
        match :share_message, via: [:get, :post]
      end
    end

    get "import_job", to: "jobs#import_job"
    post "upload_job", to: "jobs#upload_job"
    post "upload_candidate", to: "jobs#upload_candidate"
    post "upload_company", to: "jobs#upload_company"
    post "upload_contacts", to: "jobs#upload_contacts"


    get "download_job_template", to: "jobs#download_job_template"
    get "download_product_template", to: "jobs#download_product_template"
    get "download_service_template", to: "jobs#download_service_template"
    get "download_training_template", to: "jobs#download_training_template"
    get "download_candidate_template", to: "jobs#download_candidate_template"
    get "download_company_template", to: "jobs#download_company_template"
    get "download_contacts_template", to: "jobs#download_contacts_template"


    resources :bench_jobs, only: [:index, :destroy]
    resources :job_receives, only: [:index, :destroy]
    resources :public_jobs, only: [:index, :destroy] do
      get :job, on: :member
      get :apply_job_candidate, on: :member
      post :create_batch_job, on: :member
      post :create_own_job, on: :member
      post :apply, on: :member
    end
    resources :owen_jobs, only: [:index] do
      get :batch_job, on: :member
    end
    resources :conversations do
      get :search, on: :collection
      get :add_to_favourite, on: :collection
      get :remove_from_favourite, on: :collection
      post :add_to_chat, on: :collection

      get :mute, on: :member
      get :unmute, on: :member

      resources :conversation_messages do
        get :mark_as_read, on: :member
      end
    end

    resources :sell_contracts
    resources :buy_contracts

    resources :accountings do
      get :recieved_payment, on: :collection
      get :bill_to_pay, on: :collection
      get :bill_received, on: :collection
      get :bill_pay, on: :collection

      get :salary_to_pay, on: :collection
      get :salary_advance, on: :collection
      get :salary_calculation, on: :collection
      get :check_salary, on: :collection
      get :generate_salary_cycles, on: :collection
    end

  end

  scope module: :company do

    resources :activities, only: [:index]

    post 'reject_vendor', to: 'prefer_vendors#reject'
    post 'accept_vendor', to: 'prefer_vendors#accept'
    get 'network', to: 'prefer_vendors#show_network'
    # get  'hot_candidate', to: 'companies#hot_candidate'

    resources :consultants, concerns: :paginatable do
      resources :leaves do
        member do
          post :accept
          post :reject
        end
      end
    end
    resources :locations
    resources :departments
    resources :company_docs
    resources :roles
    resources :groups, concerns: :paginatable do
      member do
        post :assign_status
        post :add_reminder
      end
      collection do
        post :create_bulk_candidates
        post :create_bulk_companies
        post :create_bulk_contacts

        get :remove_from_group
        get :leave_group
      end
    end
    resources :admins, concerns: :paginatable
    resources :addresses
    resources :directories, only: [:index]
    resources :comments, only: [:create]
    resources :attachments, concerns: :paginatable, only: [:index]
    resources :company_legal_docs
    delete 'delete_company_legal_docs', to: 'company_legal_docs#delete_company_legal_docs'

    resources :company_candidate_docs
    delete 'delete_company_candidate_docs', to: 'company_candidate_docs#delete_company_candidate_docs'
    delete 'delete_company_customer_docs', to: 'company_candidate_docs#delete_company_customer_docs'
    delete 'delete_company_vendor_docs', to: 'company_candidate_docs#delete_company_vendor_docs'
    delete 'delete_company_employee_docs', to: 'company_candidate_docs#delete_company_employee_docs'

    resources :invoices, concerns: :paginatable, only: [:index, :edit, :update] do
      collection do
        get :cleared_invoice
      end
      resources :receive_payments
    end
    resources :reminders, only: :create do
      collection do
        post :create_bulk_candidates
        post :create_bulk_companies
      end
    end
    resources :invoice_term_infos
    resources :payroll_term_infos do
      collection do
        get :generate_payroll_dates
      end
    end
    resources :prefer_vendors, concerns: :paginatable do
      # end
    end
    resources :job_invitations, concerns: :paginatable, only: [:index, :show]
    resources :candidates, concerns: :paginatable, only: :index do
      match :manage_groups, via: [:get, :patch]
      post :make_hot
      post :make_normal
      get :add_reminder
      get :assign_status
      post :create_chat
      post :remove_from_comapny
      collection do
        get :share_candidates, as: :share_hot_candidates
      end

    end
    resources :job_applications, concerns: :paginatable, only: [:index, :show] do
      resources :consultants, only: [:new, :create]
      member do
        get  :share
        get  :proposal
        post :share_application_with_companies
        post :accept
        post :reject
        post :short_list
        post :interview
        post :hire
      end # End of member
    end

    resources :expenses do
      collection do
        post :create_expense_type
        get :get_bank_balance
        get :pay_expense
        post :submit_bill
        get :client_expense_bill
        post :create_client_expense_bill
        get :filter_approved_client_expense
        post :client_expense_generate_invoice
        get :client_expense_invoices
        post :invoice_payment
        get :paid_invoice_list
      end
    end

    resources :salaries do
      collection do
        get :salary_list
        get :filter_salary_cycles
        get :final_salary
        get :open_salary_process
        get :calculate_salary
        get :check_salary_status
        get :process_salary
        get :aggregate_salary
        post :add_contract_expense_type
        post :add_contract_expense_amount
        get :clear_salary
        delete :delete_contract_expense_type
        get :report
        get :calculate_commission
      end
    end

    resources :change_rates

    resources :bank_details, only: [] do
      collection do
        get :acc_info
        get :bank_reconciliation
        post :update_acc_info
      end
    end

    resources :contracts, concerns: :paginatable, except: [:destroy] do
      resources :contracts
      collection do
        post :nested_create
        get :set_job_application
        get :timeline
        get :filter_timeline
        get :add_bill
        get :add_invoice
        get :pay_bill
        get :receive_payment
        get :client_expense_submit
        get :client_expense_approve
        get :salary_settlement
        get :salary_process
        get :set_commission_user
      end
      member do
        get :download
        post :update_attachable_doc
        get :tree_view
        get :received_contract
        patch :update_contract_status
      end

      post :change_invoice_date
      resources :invoices, only: [:index, :show] do
        member do
          get :download
          post :accept_invoice
          post :reject_invoice
          get :submit_invoice
          get :paid_invoice
        end
      end
    end

    resources :jobs, concerns: :paginatable do

      match 'create_multiple_for_candidate', to: 'job_applications#create_multiple_For_candidate', via: [:get, :post]

      resources :contracts, except: [:index, :show] do
        member do
          post :open_contract, as: :open_contract
          post :update_contract_response, as: :update_contract_response
          post :create_sub_contract, as: :create_sub_contract
        end
      end # End of :contracts

      resources :job_invitations, except: [:index] do
        collection do
          post :import
          post :create_multiple
        end
        resources :job_applications, except: [:index]
        member do
          post :accept
          post :reject
        end # End of member
      end # End of :job_invitations

      member do
        post :send_invitation, as: :send_invitation
      end

      collection do
        post :share_jobs, as: :share_jobs
        post :update_media
      end
    end

    #leaves path for owner of company
    get 'leaves', to: 'leaves#employees_leaves', as: :employees_leaves
    # get 'attachment/documents_list',to: 'attachments#document_list'
    get 'dashboard', to: 'users#dashboard', as: :dashboard
    post 'update_photo', to: 'users#update_photo'
    resources :timesheets, concerns: :paginatable, only: [:show, :index, :new, :create, :edit, :update] do
      get 'submit_timesheet'
      get 'approved', on: :collection
      get 'generate_invoice'
      get 'check_invoice'
      get 'approve'
      get 'submit'
      get 'reject'
      resources :timesheet_logs, only: [:show] do
        get 'approve'
        resources :transactions, only: [:create] do
          post 'accept'
          post 'reject'
        end
      end

    end

    resources :client_expenses, only: [:index] do
      get 'approve', on: :collection
      get 'reject', on: :collection
    end
    # get 'configuration' ,   to: 'companies#edit' ,              as: :configuration
    resources :companies, concerns: :paginatable, only: [:update, :show, :index, :edit, :destroy] do
      get :contacts
      get :assign_status
      collection do
        post :change_owner
        post :get_admins_list, as: :get_admins_list
        post :update_logo
        post :update_file
        post :update_video
        post :update_candidate_docs
        post :update_legal_docs

        get :company_phone_page
        get :company_profile_page
        get :company_user_profile_page
      end
    end

  end # End of module company

  resources :companies, only: [:create, :update] do
    member do
      get :profile
    end
  end


  # Devise Routes
  devise_for :users, controllers: {invitations: 'company/invitations', passwords: 'users/passwords', sessions: 'users/sessions', confirmations: 'users/confirmations', omniauth_callbacks: 'candidates/omniauth_callbacks'}, path_names: {sign_in: 'login', sign_out: 'logout'}

  # devise_for :candidates
  devise_for :candidates, controllers: {
      sessions: 'candidates/sessions',
      registrations: 'candidates/registrations',
      passwords: 'candidates/passwords',
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
    match '/' => "static#index", via: [:get, :post]
  end

  namespace :api do
    resources :select_searches, only: :index do
      get :find_companies, on: :collection
      get :find_client_companies, on: :collection
      get :find_candidates, on: :collection
      get :find_contacts, on: :collection
      get :find_job_applicants, on: :collection
      get :find_user_sign, on: :collection
      get :find_jobs, on: :collection
      get :find_commission_user, on: :collection
      get :find_expense_type, on: :collection
      get :find_contract_candidate, on: :collection
      get :find_contract_salary_cycles, on: :collection
      get :find_commission_candidates, on: :collection
      get :find_company_admin, on: :collection
    end

    namespace :candidate do
      resources :candidates, only: :index do
        post :add_candidate, on: :collection
      end
    end

    namespace :company do
      resources :companies, only: [:index, :create] do
        post :add_company, on: :collection
      end
    end

    namespace :company do
      resources :jobs, only: [:index, :create] do
        post :add_job, on: :collection
      end
    end

    resources :job_applications, only: [:index, :create] do
      post :job_applications, on: :collection
    end

    #  resources :rss_jobs, only: [:index, :create] do
    #   get :job_feed, on: :collection
    #   # resources :rss_jobs, only: [:index, :create] do
    #   #   get :job_feed, on: :collection
    #   # end
    # end

    # post 'add_candidate',    to: 'candidates#add_candidate'
  end

  resources :conversations do
    resources :conversation_messages do
      get :messages, on: :collection
      get :pop_messages, on: :collection
      get :mark_as_read, on: :member
    end
  end
  root 'static#index'

end
