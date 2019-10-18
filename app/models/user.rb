class User < ApplicationRecord

  include DomainExtractor
  include ApplicationHelper

  has_ancestry

  EXCLUDED_EMAIL_DOMAINS = %w[gmail yahoo rediff facebookmail].freeze
  # Include default devise modules. Others available are:
  # :confirmable, :lockable, :timeoutable and :omniauthable
  devise :invitable, :database_authenticatable, :registerable,
         :recoverable, :rememberable, :trackable, :omniauthable, :confirmable

  #Serializers
  # serialize :signature, JSON

  # Validations
  # validates :first_name, :presence => true
  # validates :last_name, :presence => true
  # validates_presence_of :email
  # validates_uniqueness_of :email

  # validates_numericality_of :phone
  after_create_commit :send_confirmation_email, if: -> { user? || is_admin? }

  after_create :create_address


  attr_accessor :temp_working_hours
  attr_accessor :invitation_as_contact

  belongs_to :company, optional: true
  belongs_to :address, foreign_key: :primary_address_id, optional: true
  has_many :created_contracts, class_name: 'Contract', foreign_key: :created_by_id
  has_many :comments, class_name: 'Comment', foreign_key: :created_by_id
  has_many :contract_terms, class_name: 'ContractTerm', foreign_key: 'created_by'
  has_many :responded_contracts, class_name: 'Contract', foreign_key: :respond_by_id
  has_many :assigned_contracts, class_name: 'Contract', foreign_key: :assignee_id
  has_many :leaves, dependent: :destroy
  has_many :notifications, as: :notifiable, dependent: :destroy
  has_many :custom_fields, as: :customizable, dependent: :destroy
  has_many :attachable_docs, as: :documentable, dependent: :destroy
  has_many :company_docs, through: :attachable_docs
  has_many :job_applications, foreign_key: "applicationable_id", dependent: :destroy
  has_many :timesheets, dependent: :destroy
  has_many :timesheet_approvers, dependent: :destroy
  has_many :attachments, as: :attachable
  has_many :groupables, as: :groupable
  has_many :groups, through: :groupables
  has_and_belongs_to_many :roles
  has_many :permissions, through: :roles
  has_many :messages, as: :messageable, dependent: :destroy
  has_many :chat_users, as: :userable
  has_many :chats, through: :chat_users
  has_many :reminders
  has_many :statuses
  has_many :company_contacts
  has_many :created_company_contacts, class_name: 'CompanyContact', foreign_key: :created_by_id


  has_many :conversation_messages, as: :userable
  has_many :document_signs, as: :signable
  has_many :document_signs, as: :requested_by

  has_many :user_certificates, dependent: :destroy
  has_many :user_educations, dependent: :destroy
  has_many :user_work_clients, dependent: :destroy

  has_many :favourables, as: :favourable, class_name: "FavouriteChat", dependent: :destroy
  has_many :favourableds, as: :favourabled, class_name: "FavouriteChat", dependent: :destroy
  has_many :created_notifications, as: :createable
  has_many :contract_cycles
  
  accepts_nested_attributes_for :attachable_docs, reject_if: :all_blank
  accepts_nested_attributes_for :custom_fields, reject_if: :all_blank
  accepts_nested_attributes_for :address, reject_if: :all_blank, update_only: true
  accepts_nested_attributes_for :attachments, allow_destroy: true, reject_if: :all_blank

  accepts_nested_attributes_for :user_certificates, reject_if: :all_blank, allow_destroy: true
  accepts_nested_attributes_for :user_educations, reject_if: :all_blank, allow_destroy: true
  accepts_nested_attributes_for :user_work_clients, reject_if: :all_blank, allow_destroy: true

  #Tags Input
  acts_as_taggable_on :skills

  validates :email, uniqueness: {case_sensitive: false}, format: {with: ::EMAIL_REGEX}, presence: true
  validate :user_email_domain
  # validates_inclusion_of :time_zone, in: ActiveSupport::TimeZone.all.map { |tz| tz.tzinfo.name }

  validate :max_skill_size

  def conversations
    Conversation.all_onversations(self)
  end

  def self.like_any(fields, values)
    conditions = fields.product(values).map do |(field, value)|
      [arel_table[field].matches("#{value}%"), arel_table[field].matches("% #{value}%")]
    end
    where conditions.flatten.inject(:or)
  end


  def user?
    instance_of? User if invited_by_id.nil?
  end

  def max_skill_size
    errors[:skill_list] << "8 skills maximum" if skill_list.count > 8
  end

  def time_zone_now
    self.time_zone.present? ? Time.now.in_time_zone(self.time_zone) : Time.now
  end


  def etyme_url
    company&.etyme_url
  end

  def send_confirmation_to_company_about_onboarding
    # self.invited_by.notifications.create!(title: "#{self.full_name} On-Boarding" , message:  "#{self.full_name} has successfully completed on-boarding on Etyme.") if self.invited_by.present?
  end

  def has_submission_permission?(user)
    self == user
  end

  def has_permission (permission)
    self.permissions.where(name: permission).exists?
  end

  def is_admin?
    self.class.name == "Admin" if invited_by_id.nil?
  end

  def is_consultant?
    self.class.name == "Consultant"
  end

  def is_owner?
    self == self.company.owner
  end

  def photo
    # super.present? ? super : ActionController::Base.helpers.asset_path('avatars/m_sunny_big.png')
  end

  def full_name
    if first_name.present? || first_name.present?
      self.first_name + " " + self.last_name
    elsif company
      company.name
    else
      ""
    end
  end

  def create_address
    address = Address.new
    address.save(validate: false)
    self.primary_address_id = address.try(:id)
    self.save
  end

  def self.share_candidates(to, to_emails, c_ids, current_company, message, subject)
    UserMailer.share_hot_candidates(to, to_emails, c_ids, current_company, message, subject).deliver
  end

  def go_available
    self.chat_status = "available"
    self.save!
  end

  def go_unavailable
    self.chat_status = "unavailable"
    self.save!
  end

  def send_password_reset_email
    send_reset_password_instructions
  end

  private

  def send_confirmation_email
    # send_confirmation_instructions
  end

  def user_email_domain
    email_domain = domain_name(email)
    if email_domain.in?(EXCLUDED_EMAIL_DOMAINS)
      errors.add(:email, "cannot be your #{email_domain} id.")
    end
  end

end
