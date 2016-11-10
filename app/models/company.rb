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


  # Association
  belongs_to :owner , :class_name => 'User',  foreign_key: "owner_id"
  belongs_to :company_type
  has_many :jobs ,through: :user
  has_many :prefferd_vendors
  has_many :vendors, through: :prefferd_vendors

  # Validations

  # Nested Attributes
  accepts_nested_attributes_for :owner , allow_destroy: true

  # CallBacks

  before_create :create_slug
  after_create :set_owner_company_id
  after_create :send_confirmation_email


  def etyme_url
    "#{self.slug}.#{ENV['etyme_domain']}"
  end

  private

    def create_slug
      self.slug = self.name.parameterize("").gsub("_","-")
    end

    def set_owner_company_id
      self.owner.update_column(:company_id, id)
    end

    def send_confirmation_email
      # UserMailer.signup_confirmation(self).deliver
    end


end
