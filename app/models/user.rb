# frozen_string_literal: true

# == Schema Information
#
# Table name: users
#
#  id                     :integer          not null, primary key
#  company_id             :integer
#  first_name             :string           default("")
#  last_name              :string           default("")
#  gender                 :integer
#  email                  :string           default(""), not null
#  type                   :string
#  phone                  :string
#  primary_address_id     :integer
#  photo                  :string
#  signature              :json
#  status                 :integer
#  dob                    :date
#  encrypted_password     :string           default(""), not null
#  reset_password_token   :string
#  reset_password_sent_at :datetime
#  remember_created_at    :datetime
#  sign_in_count          :integer          default(0), not null
#  current_sign_in_at     :datetime
#  last_sign_in_at        :datetime
#  current_sign_in_ip     :string
#  last_sign_in_ip        :string
#  confirmation_token     :string
#  confirmed_at           :datetime
#  confirmation_sent_at   :datetime
#  unconfirmed_email      :string
#  created_at             :datetime         not null
#  updated_at             :datetime         not null
#  invitation_token       :string
#  invitation_created_at  :datetime
#  invitation_sent_at     :datetime
#  invitation_accepted_at :datetime
#  invitation_limit       :integer
#  invited_by_type        :string
#  invited_by_id          :integer
#  invitations_count      :integer          default(0)
#  skills                 :string
#  ssn                    :string
#  max_working_hours      :integer          default(28800)
#  time_zone              :string
#  candidate_id           :integer
#  deleted_at             :datetime
#  visa_status            :integer
#  availability           :date
#  relocation             :integer          default(0)
#  age                    :integer
#  video                  :string
#  resume                 :string
#  video_type             :string
#  chat_status            :string
#  temp_pass              :string
#  ancestry               :string
#  stripe_charge_id       :integer
#  paid                   :boolean
#  online                 :boolean          default(TRUE)
#  provider               :string
#  uid                    :string
#  online_user_status     :string
#
class User < ApplicationRecord
  include DomainExtractor
  include ApplicationHelper

  has_ancestry
  rating
 enum online_user_status: {
    online: 'online',
    in_a_meeting: 'in_a_meeting',
    onway: 'onway',
    offline: 'offline',
  }
  EXCLUDED_EMAIL_DOMAINS = %w[gmail yahoo rediff facebookmail].freeze
  # Include default devise modules. Others available are:
  # :confirmable, :lockable, :timeoutable and :omniauthable
  devise :invitable, :database_authenticatable, :registerable,
         :recoverable, :rememberable, :trackable, :confirmable

  # Serializers
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
  has_many :contract_sell_business_details

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
  has_many :job_applications, foreign_key: 'applicationable_id', dependent: :destroy
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

  has_many :favourables, as: :favourable, class_name: 'FavouriteChat', dependent: :destroy
  has_many :favourableds, as: :favourabled, class_name: 'FavouriteChat', dependent: :destroy
  has_many :created_notifications, as: :createable
  has_many :contract_cycles
  has_many :contract_admins

  accepts_nested_attributes_for :attachable_docs, reject_if: :all_blank
  accepts_nested_attributes_for :custom_fields, reject_if: :all_blank
  accepts_nested_attributes_for :address, reject_if: :all_blank, update_only: true
  accepts_nested_attributes_for :attachments, allow_destroy: true, reject_if: :all_blank

  accepts_nested_attributes_for :user_certificates, reject_if: :all_blank, allow_destroy: true
  accepts_nested_attributes_for :user_educations, reject_if: :all_blank, allow_destroy: true
  accepts_nested_attributes_for :user_work_clients, reject_if: :all_blank, allow_destroy: true

  # Tags Input
  acts_as_taggable_on :skills

  validates :email, uniqueness: { case_sensitive: false }, format: { with: ::EMAIL_REGEX }, presence: true
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
    errors[:skill_list] << '8 skills maximum' if skill_list.count > 8
  end

  def time_zone_now
    time_zone.present? ? Time.now.in_time_zone(time_zone) : Time.now
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

  def has_permission(permission)
    permissions.where(name: permission).exists?
  end

  def is_admin?
    self.class.name == 'Admin' if invited_by_id.nil?
  end

  def is_consultant?
    self.class.name == 'Consultant'
  end

  def is_owner?
    self == company.owner
  end

  def full_name
    if first_name.present? || first_name.present?
      first_name + ' ' + last_name
    elsif company
      company.name
    else
      ''
    end
  end

  def create_address
    address = Address.new
    address.save(validate: false)
    self.primary_address_id = address.try(:id)
    save
  end

  def self.share_candidates(to, to_emails, c_ids, current_company, message, subject)
    UserMailer.share_hot_candidates(to, to_emails, c_ids, current_company, message, subject).deliver
  end

  def go_available
    self.chat_status = 'available'
    save!
  end

  def go_unavailable
    self.chat_status = 'unavailable'
    save!
  end

  def send_password_reset_email
    send_reset_password_instructions
  end

  def subscribed?(company_id)
    company_contacts.find_by(company_id: company_id)
  end

  def user_company(company_id)
    CompanyContact.where(user_id: id,company_id: company_id).first
  end


  private

  def send_confirmation_email
    # send_confirmation_instructions
  end

  def user_email_domain
    email_domain = domain_name(email)
    errors.add(:email, "cannot be your #{email_domain} id.") if email_domain.in?(EXCLUDED_EMAIL_DOMAINS)
  end
end
