# == Schema Information
#
# Table name: companies
#
#  id               :integer          not null, primary key
#  owner_id         :integer
#  company_type_id  :string
#  name             :string
#  website          :string
#  logo             :string
#  description      :text
#  phone            :string
#  email            :string
#  slug             :string
#  tag_line         :string
#  linkedin_url     :string
#  facebook_url     :string
#  twitter_url      :string
#  google_url       :string
#  time_zone        :string
#  is_activated     :boolean          default(FALSE)
#  dba              :string
#  status           :boolean
#  established_date :date
#  entity_type      :integer
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#
# Indexes
#
#  index_companies_on_owner_id  (owner_id)
#

class Company < ActiveRecord::Base

  # Tagging
  acts_as_taggable_on :skills

  # Association
  #Note: Do not change the through association order.
  belongs_to :owner , class_name: 'User',  foreign_key: "owner_id"
  has_many :locations         , dependent: :destroy
  has_many :jobs              , dependent: :destroy
  has_many :users             , dependent: :destroy
  has_many :consultants
  has_many :roles             , dependent: :destroy
  has_many :company_docs      , dependent: :destroy
  has_many :contracts
  has_many :vendors
  has_many :admins
  has_many :job_invitations   , through:   :jobs
  has_many :job_applications  , through:   :job_invitations
  has_many :contracts         , through:   :job_applications
  has_one  :subscription      , dependent: :destroy
  has_one  :package           , through:   :subscription



  # Validations
  validates           :name,  presence:   true, uniqueness:{case_sensitive: false}
  validates_length_of :name,  minimum:    3   , message: "must be atleat 3 characters"
  validates_length_of :name,  maximum:    50  , message: "can have maximum of 50 characters"
  validates           :slug,  uniqueness: true

  # Nested Attributes
  accepts_nested_attributes_for :owner    , allow_destroy: true
  accepts_nested_attributes_for :locations, allow_destroy: true,reject_if: :all_blank

  # CallBacks
  before_validation :create_slug
  after_create      :set_owner_company_id
  after_create      :welcome_email_to_owner
  after_create      :assign_free_subscription



  def etyme_url
    "#{self.slug}.#{ENV['domain']}"
  end

  private

  def create_slug
    self.slug = self.name.parameterize("").gsub("_","-")
  end

  def set_owner_company_id
    self.owner.update_column(:company_id, id)
  end

  def welcome_email_to_owner
     UserMailer.welcome_email_to_owner(self).deliver
  end

  def assign_free_subscription
    self.build_subscription(package: Package.free).save
  end


end
