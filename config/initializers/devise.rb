# frozen_string_literal: true

require 'docusign'
require 'zoom'
# Use this hook to configure devise mailer, warden hooks and so forth.
# Use this hook to configure devise mailer, warden hooks and so forth.
# Many of these configuration options can be set straight in your model.
Devise.setup do |config|
  # The secret key used by Devise. Devise uses this key to generate
  # random tokens. Changing this key will render invalid all existing
  # confirmation, reset password and unlock tokens in the database.
  # Devise will use the `secret_key_base` as its `secret_key`
  # by default. You can change it below and use your own secret key.
  config.secret_key = '95b100ec889e63ed55dfca24347d0c0e03033d248b9a7871b3072c29f06fbaa96fd18636d56398821f5980d41d9188c7bacaf01914bb16859e8f269e44b0c67b'

  # ==> Mailer Configuration
  # Configure the e-mail address which will be shown in Devise::Mailer,
  # note that it will be overwritten if you use your own mailer class
  # with default "from" parameter.
  # config.mailer_sender = 'please-change-me-at-config-initializers-devise@example.com'
  config.mailer_sender = 'notify@no-reply.etyme.com'
  config.mailer = 'UserMailer'

  # Configure the class responsible to send e-mails.
  # config.mailer = 'Devise::Mailer'

  # Configure the parent class responsible to send e-mails.
  # config.parent_mailer = 'ActionMailer::Base'

  # ==> ORM configuration
  # Load and configure the ORM. Supports :active_record (default) and
  # :mongoid (bson_ext recommended) by default. Other ORMs may be
  # available as additional gems.
  require 'devise/orm/active_record'

  config.omniauth :google_oauth2, ENV['google_people_key'], ENV['google_secret_key'], image_size: 'large', skip_jwt: true
  config.omniauth :facebook, ENV['facebook_public_key'], ENV['facebook_secret_key'], scope: 'email', info_fields: 'email,name,first_name,last_name,gender', image_size: 'large'
  config.omniauth :linkedin, ENV['linked_in_public_key'], ENV['linked_in_secret_key']
  config.omniauth :docusign, Rails.application.config.client_id, Rails.application.config.client_secret, provider_ignores_state: true,
                                                                                                         setup: lambda { |env|
                                                                                                                  strategy = env['omniauth.strategy']
                                                                                                                  strategy.options[:client_options].site = Rails.application.config.app_url
                                                                                                                  strategy.options[:prompt] = 'login'
                                                                                                                  strategy.options[:oauth_base_uri] = Rails.application.config.authorization_server
                                                                                                                  strategy.options[:target_account_id] = Rails.application.config.target_account_id
                                                                                                                  strategy.options[:allow_silent_authentication] = Rails.application.config.allow_silent_authentication
                                                                                                                }
  config.omniauth :zoom, Rails.application.config.zoom_client_id, Rails.application.config.zoom_client_secret,
                  setup: lambda { |env|
                    strategy = env['omniauth.strategy']
                    strategy.options[:client_options].site = Rails.application.config.app_url
                    # strategy.options[:prompt] = 'login'
                    strategy.options[:oauth_base_uri] = Rails.application.config.zoom_authorization_server
                    # strategy.options[:target_account_id] = Rails.application.config.target_account_id
                    strategy.options[:allow_silent_authentication] = Rails.application.config.allow_silent_authentication
                  }

  # config.app_url = 'http://localhost:3000' # The public url of the application.
  # Note that the setting which controls the host/port for your app
  # is determined by your app's web server. For the default puma
  # server, see config/puma.rb
  #
  # NOTE => You must add a Redirect URI of {app_url}/auth/docusign/callback
  #         to your Integration Key.
  #
  # NOTE: The terms "client_id" and "Integration key" are synonyms. They refer to the same thing.
  # config.client_id = '78233b42-83ae-433a-9add-520b8960e731'
  # config.client_secret = '93aa8e6e-e353-4298-9096-3ccaa6c256ca'
  # config.signer_email =  'sp18-rcs-003@cuilahore.edu.pk'
  # config.signer_name = 'ali hussain'
  # config.authorization_server = 'https://account-d.docusign.com'
  # config.allow_silent_authentication = true # a user can be silently authenticated if they have an
  # # active login session on another tab of the same browser
  # # Set if you want a specific DocuSign AccountId, If false, the user's default account will be used.
  # config.target_account_id = true
  # # Payment gateway information is optional. It is only needed for example 14.
  # # See the PAYMENTS_INSTALLATION.md file for instructions
  # config.gateway_account_id = '{DS_PAYMENT_GATEWAY_ID}'
  #
  # # The remainder of this file is already configured.
  # config.demo_doc_path = 'demo_documents'
  # config.doc_docx = 'World_Wide_Corp_Battle_Plan_Trafalgar.docx'
  # config.doc_pdf = 'World_Wide_Corp_lorem.pdf'
  # config.gateway_name = "stripe"
  # config.gateway_display_name = "Stripe"
  # config.github_example_url = 'https://github.com/docusign/eg-03-ruby-auth-code-grant/tree/master/app/controllers/'
  # config.documentation = false

  # ==> Configuration for any authentication mechanism
  # Configure which keys are used when authenticating a user. The default is
  # just :email. You can configure it to use [:username, :subdomain], so for
  # authenticating a user, both parameters are required. Remember that those
  # parameters are used only when authenticating and not when retrieving from
  # session. If you need permissions, you should implement that in a before filter.
  # You can also supply a hash where the value is a boolean determining whether
  # or not authentication should be aborted when the value is not present.
  # config.authentication_keys = [:email]

  # Configure parameters from the request object used for authentication. Each entry
  # given should be a request method and it will automatically be passed to the
  # find_for_authentication method and considered in your model lookup. For instance,
  # if you set :request_keys to [:subdomain], :subdomain will be used on authentication.
  # The same considerations mentioned for authentication_keys also apply to request_keys.
  # config.request_keys = []

  # Configure which authentication keys should be case-insensitive.
  # These keys will be downcased upon creating or modifying a user and when used
  # to authenticate or find a user. Default is :email.
  config.case_insensitive_keys = [:email]

  # Configure which authentication keys should have whitespace stripped.
  # These keys will have whitespace before and after removed upon creating or
  # modifying a user and when used to authenticate or find a user. Default is :email.
  config.strip_whitespace_keys = [:email]

  # Tell if authentication through request.params is enabled. True by default.
  # It can be set to an array that will enable params authentication only for the
  # given strategies, for example, `config.params_authenticatable = [:database]` will
  # enable it only for database (email + password) authentication.
  # config.params_authenticatable = true

  # Tell if authentication through HTTP Auth is enabled. False by default.
  # It can be set to an array that will enable http authentication only for the
  # given strategies, for example, `config.http_authenticatable = [:database]` will
  # enable it only for database authentication. The supported strategies are:
  # :database      = Support basic authentication with authentication key + password
  # config.http_authenticatable = false

  # If 401 status code should be returned for AJAX requests. True by default.
  # config.http_authenticatable_on_xhr = true

  # The realm used in Http Basic Authentication. 'Application' by default.
  # config.http_authentication_realm = 'Application'

  # It will change confirmation, password recovery and other workflows
  # to behave the same regardless if the e-mail provided was right or wrong.
  # Does not affect registerable.
  # config.paranoid = true

  # By default Devise will store the user in session. You can skip storage for
  # particular strategies by setting this option.
  # Notice that if you are skipping storage for all authentication paths, you
  # may want to disable generating routes to Devise's sessions controller by
  # passing skip: :sessions to `devise_for` in your config/routes.rb
  config.skip_session_storage = [:http_auth]

  # By default, Devise cleans up the CSRF token on authentication to
  # avoid CSRF token fixation attacks. This means that, when using AJAX
  # requests for sign in and sign up, you need to get a new CSRF token
  # from the server. You can disable this option at your own risk.
  # config.clean_up_csrf_token_on_authentication = true

  # When false, Devise will not attempt to reload routes on eager load.
  # This can reduce the time taken to boot the app but if your application
  # requires the Devise mappings to be loaded during boot time the application
  # won't boot properly.
  # config.reload_routes = true

  # ==> Configuration for :database_authenticatable
  # For bcrypt, this is the cost for hashing the password and defaults to 11. If
  # using other algorithms, it sets how many times you want the password to be hashed.
  #
  # Limiting the stretches to just one in testing will increase the performance of
  # your test suite dramatically. However, it is STRONGLY RECOMMENDED to not use
  # a value less than 10 in other environments. Note that, for bcrypt (the default
  # algorithm), the cost increases exponentially with the number of stretches (e.g.
  # a value of 20 is already extremely slow: approx. 60 seconds for 1 calculation).
  config.stretches = Rails.env.test? ? 1 : 11

  # Set up a pepper to generate the hashed password.
  # config.pepper = '4bd37e89a31e33bd9fb07fba48de0897c706cbfd7b00d404fcb66a9b15c35342f5d5a732ce0bd09dbfd1c528fc1293eae6fa279b1062910977d587144489034e'

  # Send a notification email when the user's password is changed
  # config.send_password_change_notification = false

  # ==> Configuration for :invitable
  # The period the generated invitation token is valid, after
  # this period, the invited resource won't be able to accept the invitation.
  # When invite_for is 0 (the default), the invitation won't expire.
  # config.invite_for = 2.weeks

  # Number of invitations users can send.
  # - If invitation_limit is nil, there is no limit for invitations, users can
  # send unlimited invitations, invitation_limit column is not used.
  # - If invitation_limit is 0, users can't send invitations by default.
  # - If invitation_limit n > 0, users can send n invitations.
  # You can change invitation_limit column for some users so they can send more
  # or less invitations, even with global invitation_limit = 0
  # Default: nil
  # config.invitation_limit = 5

  # The key to be used to check existing users when sending an invitation
  # and the regexp used to test it when validate_on_invite is not set.
  # config.invite_key = {:email => /\A[^@]+@[^@]+\z/}
  # config.invite_key = {:email => /\A[^@]+@[^@]+\z/, :username => nil}

  # Flag that force a record to be valid before being actually invited
  # Default: false
  # config.validate_on_invite = true

  # Resend invitation if user with invited status is invited again
  # Default: true
  # config.resend_invitation = false

  # The class name of the inviting model. If this is nil,
  # the #invited_by association is declared to be polymorphic.
  # Default: nil
  # config.invited_by_class_name = 'User'

  # The foreign key to the inviting model (if invited_by_class_name is set)
  # Default: :invited_by_id
  # config.invited_by_foreign_key = :invited_by_id

  # The column name used for counter_cache column. If this is nil,
  # the #invited_by association is declared without counter_cache.
  # Default: nil
  # config.invited_by_counter_cache = :invitations_count

  # Auto-login after the user accepts the invite. If this is false,
  # the user will need to manually log in after accepting the invite.
  # Default: true
  # config.allow_insecure_sign_in_after_accept = false

  # ==> Configuration for :confirmable
  # A period that the user is allowed to access the website even without
  # confirming their account. For instance, if set to 2.days, the user will be
  # able to access the website for two days without confirming their account,
  # access will be blocked just in the third day. Default is 0.days, meaning
  # the user cannot access the website without confirming their account.
  # config.allow_unconfirmed_access_for = 2.days

  # A period that the user is allowed to confirm their account before their
  # token becomes invalid. For example, if set to 3.days, the user can confirm
  # their account within 3 days after the mail was sent, but on the fourth day
  # their account can't be confirmed with the token any more.
  # Default is nil, meaning there is no restriction on how long a user can take
  # before confirming their account.
  # config.confirm_within = 3.days

  # If true, requires any email changes to be confirmed (exactly the same way as
  # initial account confirmation) to be applied. Requires additional unconfirmed_email
  # db field (see migrations). Until confirmed, new email is stored in
  # unconfirmed_email column, and copied to email column on successful confirmation.
  config.reconfirmable = false

  # Defines which key will be used when confirming an account
  # config.confirmation_keys = [:email]

  # ==> Configuration for :rememberable
  # The time the user will be remembered without asking for credentials again.
  # config.remember_for = 2.weeks

  # Invalidates all the remember me tokens when the user signs out.
  config.expire_all_remember_me_on_sign_out = true

  # If true, extends the user's remember period when remembered via cookie.
  # config.extend_remember_period = false

  # Options to be passed to the created cookie. For instance, you can set
  # secure: true in order to force SSL only cookies.
  # config.rememberable_options = {}

  # ==> Configuration for :validatable
  # Range for password length.
  config.password_length = 6..128

  # Email regex used to validate email formats. It simply asserts that
  # one (and only one) @ exists in the given string. This is mainly
  # to give user feedback and not to assert the e-mail validity.
  config.email_regexp = /\A[^@\s]+@[^@\s]+\z/

  # ==> Configuration for :timeoutable
  # The time you want to timeout the user session without activity. After this
  # time the user will be asked for credentials again. Default is 30 minutes.
  # config.timeout_in = 30.minutes

  # ==> Configuration for :lockable
  # Defines which strategy will be used to lock an account.
  # :failed_attempts = Locks an account after a number of failed attempts to sign in.
  # :none            = No lock strategy. You should handle locking by yourself.
  # config.lock_strategy = :failed_attempts

  # Defines which key will be used when locking and unlocking an account
  # config.unlock_keys = [:email]

  # Defines which strategy will be used to unlock an account.
  # :email = Sends an unlock link to the user email
  # :time  = Re-enables login after a certain amount of time (see :unlock_in below)
  # :both  = Enables both strategies
  # :none  = No unlock strategy. You should handle unlocking by yourself.
  # config.unlock_strategy = :both

  # Number of authentication tries before locking an account if lock_strategy
  # is failed attempts.
  # config.maximum_attempts = 20

  # Time interval to unlock the account if :time is enabled as unlock_strategy.
  # config.unlock_in = 1.hour

  # Warn on the last attempt before the account is locked.
  # config.last_attempt_warning = true

  # ==> Configuration for :recoverable
  #
  # Defines which key will be used when recovering the password for an account
  # config.reset_password_keys = [:email]

  # Time interval you can reset your password with a reset password key.
  # Don't put a too small interval or your devise won't have the time to
  # change their passwords.
  config.reset_password_within = 6.hours

  # When set to false, does not sign a user in automatically after their password is
  # reset. Defaults to true, so a user is signed in automatically after a reset.
  # config.sign_in_after_reset_password = true

  # ==> Configuration for :encryptable
  # Allow you to use another hashing or encryption algorithm besides bcrypt (default).
  # You can use :sha1, :sha512 or algorithms from others authentication tools as
  # :clearance_sha1, :authlogic_sha512 (then you should set stretches above to 20
  # for default behavior) and :restful_authentication_sha1 (then you should set
  # stretches to 10, and copy REST_AUTH_SITE_KEY to pepper).
  #
  # Require the `devise-encryptable` gem when using anything other than bcrypt
  # config.encryptor = :sha512

  # ==> Scopes configuration
  # Turn scoped views on. Before rendering "sessions/new", it will first check for
  # "devise/sessions/new". It's turned off by default because it's slower if you
  # are using only default views.
  # config.scoped_views = false

  # Configure the default scope given to Warden. By default it's the first
  # devise role declared in your routes (usually :user).
  # config.default_scope = :user

  # Set this configuration to false if you want /devise/sign_out to sign out
  # only the current scope. By default, Devise signs out all scopes.
  # config.sign_out_all_scopes = true

  # ==> Navigation configuration
  # Lists the formats that should be treated as navigational. Formats like
  # :html, should redirect to the sign in page when the user does not have
  # access, but formats like :xml or :json, should return 401.
  #
  # If you have any extra navigational formats, like :iphone or :mobile, you
  # should add them to the navigational formats lists.
  #
  # The "*/*" below is required to match Internet Explorer requests.
  # config.navigational_formats = ['*/*', :html]

  # The default HTTP method used to sign out a resource. Default is :delete.
  config.sign_out_via = :delete

  # ==> OmniAuth
  # Add a new OmniAuth provider. Check the wiki for more information on setting
  # up on your models and hooks.
  # config.omniauth :github, 'APP_ID', 'APP_SECRET', scope: 'user,public_repo'

  # ==> Warden configuration
  # If you want to use other strategies, that are not supported by Devise, or
  # change the failure app, you can configure them inside the config.warden block.
  #
  # config.warden do |manager|
  #   manager.intercept_401 = false
  #   manager.default_strategies(scope: :user).unshift :some_external_strategy
  # end

  # ==> Mountable engine configurations
  # When using Devise inside an engine, let's call it `MyEngine`, and this engine
  # is mountable, there are some extra configurations to be taken into account.
  # The following options are available, assuming the engine is mounted as:
  #
  #     mount MyEngine, at: '/my_engine'
  #
  # The router that invoked `devise_for`, in the example above, would be:
  # config.router_name = :my_engine
  #
  # When using OmniAuth, Devise cannot automatically set OmniAuth path,
  # so you need to do it manually. For the devise scope, it would be:
  # config.omniauth_path_prefix = '/my_engine/devise/auth'
end
