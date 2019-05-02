class Group < ApplicationRecord
  belongs_to :company, optional: true
  has_many :groupables ,dependent:  :destroy
  has_many :candidates  , through: :groupables, source: "groupable"  ,source_type: "Candidate"
  has_many :companies   , through: :groupables, source: "groupable"  ,source_type: "Company"
  has_many :users       , through: :groupables, source: "groupable"  ,source_type: "User"
  has_many :company_contacts       , through: :groupables, source: "groupable"  ,source_type: "CompanyContact"

  def photo
    ActionController::Base.helpers.asset_path('default_logo.png')
  end

  def full_name
    group_name.to_s.titleize
  end
end
