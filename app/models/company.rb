# frozen_string_literal: true

class Company < ApplicationRecord
  EXCLUDED_SUBDOMAINS = %w[admin www administrator admins owner etyme mail ftp].freeze
  EXCLUDED_DOMAINS = %w[gmail.com facebook.com reddit.com yahoo.com rediff.com facebookmail.com fb.com].freeze
  include PublicActivity::Model
  include QuerySelector

  tracked owner: ->(controller, _model) { controller && controller.current_user }

  acts_as_taggable_on :skills

  enum company_type: %i[hiring_manager vendor]

  # Note: Do not change the through association order.
  belongs_to :owner, class_name: 'Admin', foreign_key: 'owner_id', optional: true
  belongs_to :currency, optional: true
  has_many :contract_admins
  has_many :locations, dependent: :destroy
  has_many :jobs, dependent: :destroy
  has_many :users, dependent: :destroy
  has_many :admins, dependent: :destroy
  has_many :contracts, dependent: :destroy
  has_many :buy_contracts, through: :contracts
  has_many :sell_contracts, through: :contracts
  has_many :in_progress_contracts, -> { where(status: 'in_progress') }, class_name: 'Contract'
  has_many :consultants, dependent: :destroy
  has_many :roles, dependent: :destroy
  has_many :company_docs, dependent: :destroy
  has_many :attachments
  has_many :timesheets, dependent: :destroy
  has_many :invited_companies, class_name: 'InvitedCompany', foreign_key: 'invited_by_company_id', dependent: :destroy
  has_one :invited_by, class_name: 'InvitedCompany', foreign_key: 'invited_company_id', dependent: :destroy
  has_many :sent_contracts, class_name: 'Contract', foreign_key: 'company_id', dependent: :destroy
  has_many :sent_job_applications, class_name: 'JobApplication', foreign_key: 'company_id', dependent: :destroy
  has_many :sent_job_invitations, class_name: 'JobInvitation', foreign_key: 'company_id', dependent: :destroy
  has_many :job_invitations_sender, as: :sender, class_name: 'JobInvitation'

  has_many :received_job_applications, through: :jobs, source: 'job_applications'
  has_many :received_job_invitations, through: :admins, source: 'job_invitations'
  has_many :received_timesheets, through: :jobs, source: 'timesheets'
  # has_many :received_contracts        , through:   :sent_job_applications , source: 'contract'
  has_many :received_contracts, class_name: 'Contract', as: :contractable
  has_many :leaves, through: :users
  has_many :timesheet_logs, through: :timesheets
  has_many :timesheet_approvers, through: :timesheets
  has_many :job_invitations, as: :sender

  # has_many :sent_invoices             , through:   :received_contracts ,source:  :invoices
  # has_many :received_invoices         , through:   :sent_contracts ,source:  :invoices

  has_many :sent_invoices, class_name: 'Invoice', foreign_key: 'sender_company_id'
  has_many :receive_invoices, class_name: 'Invoice', foreign_key: 'receiver_company_id'

  has_many :groups
  # has_many :invoices                  , through:   :timesheets
  has_one :package, through: :subscription
  has_many :candidates_companies, dependent: :destroy
  has_many :candidates, through: :candidates_companies
  has_many :prefer_vendors
  has_many :perfer_vendor_companies, class_name: 'PreferVendor', foreign_key: 'vendor_id'
  has_many :company_contacts, class_name: 'CompanyContact', foreign_key: 'company_id', dependent: :destroy
  has_many :user_contacts, class_name: 'CompanyContact', foreign_key: 'user_company_id'
  has_many :comments, as: :commentable
  has_many :custom_fields, as: :customizable, dependent: :destroy
  has_many :reminders, as: :reminderable
  has_many :chats, dependent: :destroy
  has_many :prefer_vendors_chats, -> { where chatable_type: 'Company' }, class_name: 'Chat', foreign_key: :chatable_id, foreign_type: :chatable_type, dependent: :destroy
  has_many :branches
  has_many :billing_infos
  has_many :company_departments
  has_many :addresses, through: :locations

  # company have many band resources through banned
  has_many :banned_list, foreign_key: 'company_id', class_name: 'BlackLister'
  # company can check the black listed status through black_listers
  has_many :black_listers, as: :blacklister

  has_many :statuses, as: :statusable

  has_many :active_relationships, class_name: 'SharedCandidate',
                                  foreign_key: 'shared_by_id', dependent: :destroy
  has_many :passive_relationships, class_name: 'SharedCandidate',
                                   foreign_key: 'shared_to_id', dependent: :destroy

  has_many :share_by, through: :active_relationships, source: :shared_by
  has_many :share_to, through: :passive_relationships, source: :shared_to
  has_many :document_signs, as: :signable
  has_many :contract_salary_histories, dependent: :destroy
  has_many :invoice_infos
  has_many :payroll_infos
  has_many :company_legal_docs, dependent: :destroy
  has_many :company_candidate_docs, dependent: :destroy
  has_many :company_vendor_docs, dependent: :destroy
  has_many :company_customer_docs, dependent: :destroy
  has_many :company_employee_docs, dependent: :destroy
  has_many :company_videos, dependent: :destroy
  has_many :contract_cycles, through: :contracts
  # has_many :candidates, through: :contracts
  has_many :bank_details
  has_many :client_expenses
  has_many :plugins
  has_many :document_signs
  has_many :approvals
  has_many :company_customer_vendors
  # validates           :company_type, inclusion: { in: [0, 1] } , presence: true
  # validates           :company_type, inclusion: {in: %w(0 , 1)}
  # validates           :name,  presence:   true
  # validates           :domain, uniqueness:   true
  has_many :activities, as: :trackable, class_name: 'PublicActivity::Activity', dependent: :destroy
  has_many :holidays
  # validates_uniqueness_of   :name, message: "This company is already registered on etyme. You can connect with its Admin and he can allow you to be added into the company"
  # validates_length_of :name,  minimum:    3   , message: "must be atleat 3 characters"
  validates :name, presence: true
  validates_length_of :name, maximum: 50, message: 'can have maximum of 50 characters'
  validates_uniqueness_of :slug, :website, message: 'This company is already registered on etyme.'
  # validates_uniqueness_of    :domain,  message: "This company is already registered on etyme. In order to invited to the company; Please talk to the admin / owner of the company.  Or you can register a new company with a different name"
  validates_exclusion_of :slug, in: EXCLUDED_SUBDOMAINS, message: 'is not allowed. Please choose another subdomain'
  validates_format_of :slug, with: /\A[\w\-]+\Z/i, allow_blank: true, message: 'is not allowed. Please choose another subdomain.'
  validates_exclusion_of :domain, in: EXCLUDED_DOMAINS, message: 'is not allowed. Please use comapany email'

  accepts_nested_attributes_for :owner, allow_destroy: true
  accepts_nested_attributes_for :company_contacts, allow_destroy: true
  accepts_nested_attributes_for :locations, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :company_contacts, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :invited_by, allow_destroy: true
  accepts_nested_attributes_for :custom_fields, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :billing_infos, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :branches, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :company_departments, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :invoice_infos, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :payroll_infos, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :addresses, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :company_legal_docs, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :company_candidate_docs, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :company_vendor_docs, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :company_customer_docs, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :company_employee_docs, allow_destroy: true, reject_if: :all_blank

  before_validation :create_slug
  after_create :set_owner_company_id, if: proc { |com| com.owner.present? }
  # after_create :welcome_email_to_owner, if: Proc.new { |comp| !comp.invited_by.present? }
  after_create :create_defult_roles
  after_create :create_associated_roles
  after_create :send_owner_password_reset_email, if: proc { |com| com.owner.present? }
  # after_create  :set_account_on_seq

  scope :vendors, -> { where(company_type: 1) }
  scope :signup_companies, -> { Company.where.not(id: InvitedCompany.select(:invited_company_id)) }
  scope :search_by, ->(term, _search_scop) { Company.where('lower(name) like :term or lower(description) like :term or lower(email) like :term or lower(phone) like :term', term: "#{term&.downcase}%") }

  scope :status_count, lambda { |company, start_date, end_date|
                         company.received_job_applications.reorder('')
                                .select('COUNT(*) as count, job_applications.status')
                                .where(created_at: start_date...end_date)
                                .where(status: %i[applied prescreen rate_confirmation client_submission interviewing hired])
                                .group(:status)
                       }

  scope :vendor_contracts, ->(company) { Contract.join(:buy_contract).where("buy_contracts.company_id": company.id) }

  attr_accessor :send_email

  def self.like_any(fields, values)
    conditions = fields.product(values).map do |(field, value)|
      [arel_table[field].matches("#{value}%"), arel_table[field].matches("% #{value}%")]
    end
    where conditions.flatten.inject(:or)
  end

  def invited_companies_contacts
    CompanyContact.where(company_id: invited_companies.map(&:invited_company_id))
  end

  def get_blacklist_status(black_list_company_id)
    black_listers.find_by(company_id: black_list_company_id)&.status || 'unbanned'
  end

  def full_name
    name
  end

  def all_admins_has_permission?(permission)
    admins.joins(:permissions).where('permissions.name = ?', permission).group('users.id') || []
  end

  def etyme_url
    Rails.env.development? ? "#{slug}.#{ENV['domain']}" : "#{slug}.#{ENV['domain']}"
  end

  def find_sent_or_received_invitation(invitation_id)
    JobInvitation.where('job_invitations.id = :i_id and (job_invitations.company_id = :c_id or (job_invitations.recipient_id in (:admins_id) and job_invitations.recipient_type = :obj_type))', c_id: id, admins_id: admins.ids, obj_type: 'User', i_id: invitation_id).limit(1)
  end

  def send_or_received_network
    PreferVendor.where('(prefer_vendors.vendor_id= :c_id OR prefer_vendors.company_id= :c_id) AND prefer_vendors.status = 1', c_id: id)
  end

  def not_invited
    PreferVendor.where('(prefer_vendors.vendor_id= :c_id OR prefer_vendors.company_id= :c_id) AND prefer_vendors.status = 0', c_id: id)
  end

  def hot_candidates
    CandidatesCompany.hot_candidate.where(company_id: id)
  end

  def prefer_vendor_companies
    Company.find((send_or_received_network.map(&:vendor_id) + send_or_received_network.map(&:company_id)).uniq)
  end

  def logo
    super.present? ? super : ActionController::Base.helpers.asset_path('default_logo.png')
  end

  def photo
    logo
  end

  def is_freelancer?
    name == 'freelancer'
  end

  def self.get_freelancer_company
    Company.find_by_domain('freelancer.com')
  end

  # def already_prefered(c)
  #   Company.where.not(:id=>PreferVendor.select(:vendor_id).where(company_id=c.id))
  # end

  def candidate_job_templates
    company_candidate_docs.where(document_for: 'Candidate', title_type: 'Job', is_require: 'signature')
  end

  def customer_job_templates
    company_candidate_docs.where(document_for: 'Customer', title_type: 'Contract', is_require: 'signature')
  end

  def candidate_contract_templates(is_require)
    company_candidate_docs.where(document_for: 'Candidate', title_type: 'Contract', is_require: is_require)
  end

  def customer_contract_templates(is_require)
    company_candidate_docs.where(document_for: 'Customer', title_type: 'Contract', is_require: is_require)
  end

  def is_vendor?(company)
    prefer_vendors.find_by_vendor_id(company.id)
  end

  private

  def send_owner_password_reset_email
    owner.send_password_reset_email
  end

  def create_slug
    if domain.present? && slug.blank?
      total_slug = Company.where('slug like ?', "#{domain.split('.')[0].gsub(/[^0-9A-Za-z.]/, '').downcase}_").count
      self.slug = if total_slug == 0
                    domain.split('.')[0].gsub(/[^0-9A-Za-z.]/, '').downcase.to_s
                  else
                    "#{domain.split('.')[0].gsub(/[^0-9A-Za-z.]/, '').downcase}#{total_slug + 1}"
                  end
    end
  end

  def set_owner_company_id
    owner.update_column(:company_id, id)
  end

  # Call after create
  def welcome_email_to_owner
    UserMailer.welcome_email_to_owner(self).deliver_now
  end

  def create_defult_roles
    roles.create(name: 'Recruiter', permissions: Permission.where(name: %w[manage_consultants manage_jobs manage_vendors send_job_invitations manage_job_invitations manage_job_applications create_new_contracts show_contracts_details edit_contracts_terms]))
    roles.create(name: 'Sales - client requirement', permissions: Permission.where(name: ['show_invoices']))
    roles.create(name: 'HR admin', permissions: Permission.where(name: %w[manage_consultants manage_jobs manage_vendors send_job_invitations manage_job_invitations manage_job_applications create_new_contracts show_contracts_details edit_contracts_terms manage_leaves]))
    roles.create(name: 'Accountant', permissions: Permission.where(name: ['show_invoices']))
    roles.create(name: 'Sales - bench marketing', permissions: Permission.where(name: %w[manage_timesheets show_invoices]))
    roles.create(name: 'Timesheet admin', permissions: Permission.where(name: %w[manage_timesheets show_invoices]))
  end

  def set_account_on_seq
    ledger = Sequence::Client.new(
      ledger_name: ENV['seq_ledgers'],
      credential: ENV['seq_token']
    )

    key = ledger.keys.query(aliases: ['company']).first
    key = ledger.keys.create(id: 'company') unless key.present?

    account = ledger.accounts.create(
      alias: "comp_#{id}",
      keys: [key],
      quorum: 1,
      tags: {
        id: id,
        name: owner.full_name,
        email: owner.email,
        phone: owner.phone
      }
    )
  end

  def create_associated_roles
    roles.create(name: 'Manager')
  end
end
