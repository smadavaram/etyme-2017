
class Company < ActiveRecord::Base
  include PublicActivity::Model
  tracked owner: ->(controller, model) { controller && controller.current_user }
  EXCLUDED_SUBDOMAINS = %w(admin www administrator admins owner etyme mail ftp)

  acts_as_taggable_on :skills

  enum company_type: [:hiring_manager, :vendor]

  #Note: Do not change the through association order.
  belongs_to :owner                   , class_name: 'Admin'         , foreign_key: "owner_id"
  belongs_to :currency
  has_many :locations                 , dependent: :destroy
  has_many :jobs                      , dependent: :destroy
  has_many :users                     , dependent: :destroy
  has_many :admins                    , dependent: :destroy
  has_many :consultants               , dependent: :destroy
  has_many :roles                     , dependent: :destroy
  has_many :company_docs              , dependent: :destroy
  has_many :attachments
  has_many :timesheets                , dependent: :destroy
  has_many :invited_companies         ,class_name: "InvitedCompany" , foreign_key: "invited_by_company_id", dependent:  :destroy
  has_one  :invited_by                ,class_name: "InvitedCompany" , foreign_key: "invited_company_id", dependent:  :destroy
  has_many :sent_contracts            , class_name: 'Contract'      , foreign_key: 'company_id' ,dependent: :destroy
  has_many :sent_job_applications     , class_name: 'JobApplication', foreign_key: 'company_id' ,dependent: :destroy
  has_many :sent_job_invitations      , class_name: 'JobInvitation' , foreign_key: 'company_id' ,dependent: :destroy
  has_many :received_job_applications , through:   :jobs                  , source: 'job_applications'
  has_many :received_job_invitations  , through:   :admins                , source: 'job_invitations'
  has_many :received_timesheets       , through:   :jobs                  , source: 'timesheets'
  # has_many :received_contracts        , through:   :sent_job_applications , source: 'contract'
  has_many :received_contracts        , class_name: 'Contract'      , as: :contractable
  has_many :leaves                    , through:   :users
  has_many :timesheet_logs            , through:   :timesheets
  has_many :timesheet_approvers       , through:   :timesheets
  has_many :sent_invoices             , through:   :received_contracts ,source:  :invoices
  has_many :received_invoices         , through:   :sent_contracts ,source:  :invoices
  has_many :groups
  # has_many :invoices                  , through:   :timesheets
  has_one  :subscription              , dependent: :destroy
  has_one  :package                   , through:   :subscription
  has_many :candidates_companies  ,dependent: :destroy
  has_many :candidates , through: :candidates_companies
  has_many :prefer_vendors
  has_many :perfer_vendor_companies ,class_name: "PreferVendor" , foreign_key: 'vendor_id'

  # validates           :company_type, inclusion: { in: [0, 1] } , presence: true
  # validates           :company_type, inclusion: {in: %w(0 , 1)}
  validates           :name,  presence:   true
  # validates_uniqueness_of   :name, message: "This company is already registered on etyme. You can connect with its Admin and he can allow you to be added into the company"
  validates_length_of :name,  minimum:    3   , message: "must be atleat 3 characters"
  validates_length_of :name,  maximum:    50  , message: "can have maximum of 50 characters"
  validates_uniqueness_of    :slug,  message: "This company is already registered on etyme. In order to invited to the company; Please talk to the admin / owner of the company.  Or you can register a new company with a different name"
  validates_uniqueness_of    :domain,  message: "This company is already registered on etyme. In order to invited to the company; Please talk to the admin / owner of the company.  Or you can register a new company with a different name"
  validates_exclusion_of :slug, in: EXCLUDED_SUBDOMAINS, message: "is not allowed. Please choose another subdomain"
  validates_format_of :slug, with: /\A[\w\-]+\Z/i, allow_blank: true, message: "is not allowed. Please choose another subdomain."

  accepts_nested_attributes_for :owner    , allow_destroy: true
  accepts_nested_attributes_for :locations, allow_destroy: true,reject_if: :all_blank
  accepts_nested_attributes_for :invited_by    , allow_destroy: true


  before_create :create_slug
  after_create      :set_owner_company_id
  after_create      :welcome_email_to_owner
  after_create      :assign_free_subscription
  after_create      :create_defult_roles

  scope :vendors, -> {where(company_type: 1)}
  scope :signup_companies,->{ Company.where.not(:id=>InvitedCompany.select(:invited_company_id))}



  attr_accessor :send_email


  def all_admins_has_permission? permission
    self.admins.joins(:permissions).where('permissions.name = ?' , permission).group('users.id') || []

  end

  def etyme_url
    Rails.env.development? ? "#{self.slug}.#{ENV['domain']}:3000" : "#{self.slug}.#{ENV['domain']}"
  end

  def find_sent_or_received_invitation(invitation_id)
    JobInvitation.where("job_invitations.id = :i_id and (job_invitations.company_id = :c_id or (job_invitations.recipient_id in (:admins_id) and job_invitations.recipient_type = :obj_type))" , {c_id: self.id, admins_id: self.admins.ids , obj_type: 'User' , i_id: invitation_id}).limit(1)
  end

  def send_or_received_network
   PreferVendor.where('(prefer_vendors.vendor_id= :c_id OR prefer_vendors.company_id= :c_id) AND prefer_vendors.status = 1',{c_id: self.id})
  end
  def not_invited
    PreferVendor.where('(prefer_vendors.vendor_id= :c_id OR prefer_vendors.company_id= :c_id) AND prefer_vendors.status = 0',{c_id: self.id})
  end

  # def already_prefered(c)
  #   Company.where.not(:id=>PreferVendor.select(:vendor_id).where(company_id=c.id))
  # end
  private
  def create_slug
    get_host_from_domain()
  end

  def get_host_from_domain
    domain = self.domain.gsub(/[^0-9A-Za-z.]/, '')
    url = URI.parse(domain).scheme.nil? ? "http://#{domain}" : domain
    host = URI.parse(url).host.downcase
    self.slug = host.start_with?('www.') ? host[4..-1].split(".").first : host.split(".").first
  end

  def set_owner_company_id
    self.owner.update_column(:company_id, id)
    # self.owner.accept_invitation!
  end

  # Call after create
  def welcome_email_to_owner
    if self.owner.password.present?
      UserMailer.welcome_email_to_owner(self).deliver_now
    else
      self.owner.send_invitation if self.send_email == '1'
    end
  end

  def assign_free_subscription
    self.build_subscription(package: Package.free).save
  end

  def create_defult_roles
    self.roles.create(name:'Recruiter',permissions: Permission.where(name:["manage_consultants","manage_jobs","manage_vendors","send_job_invitations","manage_job_invitations","manage_job_applications"]))
    self.roles.create(name:'Sales - client requirement',permissions:Permission.where(name:["show_invoices"]))
    self.roles.create(name:'Sales - bench marketing',permissions:Permission.where(name:["manage_consultants","manage_jobs","manage_vendors","send_job_invitations","manage_job_invitations","manage_job_applications","create_new_contracts","show_contracts_details","edit_contracts_terms","manage_leaves"]))
    self.roles.create(name:'Accountant',permissions:Permission.where(name:['show_invoices']))
    self.roles.create(name:'HR admin',permissions:Permission.where(name:["manage_timesheets","show_invoices"]))
    self.roles.create(name:'Timesheet admin',permissions:Permission.where(name:["manage_timesheets","show_invoices"]))
  end


end
