# == Schema Information
#
# Table name: devise
#
#  id                     :integer          not null, primary key
#  first_name             :string           default("")
#  last_name              :string           default("")
#  gender                 :boolean
#  email                  :string           default(""), not null
#  type                   :string
#  phone                  :string
#  country                :string
#  state                  :string
#  city                   :string
#  zip_code               :string
#  photo                  :string
#  status                 :boolean
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
#  company_id             :integer
#
# Indexes
#
#  index_users_on_confirmation_token    (confirmation_token) UNIQUE
#  index_users_on_email                 (email) UNIQUE
#  index_users_on_reset_password_token  (reset_password_token) UNIQUE
#

class User < ActiveRecord::Base
  # Include default devise modules. Others available are:
  # :confirmable, :lockable, :timeoutable and :omniauthable
  devise :invitable, :database_authenticatable, :registerable,
         :recoverable, :rememberable, :trackable

  #Serializers
  # serialize :signature, JSON

  # Validations
  # validates :first_name, :presence => true
  # validates :last_name, :presence => true
  # validates_presence_of :email
  # validates_uniqueness_of :email

  after_create :create_address


  attr_accessor :temp_working_hours

  belongs_to :company
  belongs_to :address           , foreign_key: :primary_address_id
  has_many :created_contracts   , class_name: 'Contract' , foreign_key: :created_by_id
  has_many :comments            , class_name: 'Comment' , foreign_key: :created_by_id
  has_many :contract_terms      , class_name: 'ContractTerm' , foreign_key: 'created_by'
  has_many :responded_contracts , class_name: 'Contract' , foreign_key: :respond_by_id
  has_many :assigned_contracts  , class_name: 'Contract' , foreign_key: :assignee_id
  has_many :leaves              , dependent: :destroy
  has_many :notifications       , as: :notifiable,dependent: :destroy
  has_many :custom_fields       , as: :customizable,dependent: :destroy
  has_many :attachable_docs     , as: :documentable , dependent: :destroy
  has_many :company_docs        , through: :attachable_docs
  has_many :job_applications    , dependent: :destroy
  has_many :timesheets          , dependent: :destroy
  has_many :timesheet_approvers , dependent: :destroy
  has_and_belongs_to_many :roles

  accepts_nested_attributes_for :attachable_docs , reject_if: :all_blank
  accepts_nested_attributes_for :custom_fields   , reject_if: :all_blank
  accepts_nested_attributes_for :address   , reject_if: :all_blank, update_only: true

  validates_numericality_of :max_working_hours, only_integer: true, greater_than_or_equal_to: 0 , less_than_or_equal_to: 86400
  # validates_inclusion_of :time_zone, in: ActiveSupport::TimeZone.all.map { |tz| tz.tzinfo.name }

  def time_zone_now
    self.time_zone.present? ? Time.now.in_time_zone(self.time_zone) : Time.now
  end

  def is_admin?
    self.class.name == "Admin"
  end

  def is_candidate?
    self.class.name == "Candidate"
  end

  def is_owner?
    self == self.company.owner
  end

  def photo
    super.present? ? super : 'avatars/male.png'
  end

  def full_name
    self.first_name + " " + self.last_name
  end

  def has_submission_permission?(user)
    self == user
  end

  def create_address
    address=Address.new
    address.save(validate: false)
    self.primary_address_id = address.try(:id)
    self.save
  end



end
