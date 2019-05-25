class Group < ApplicationRecord
  belongs_to :company, optional: true
  has_many :groupables ,dependent:  :destroy
  has_many :candidates  , through: :groupables, source: "groupable"  ,source_type: "Candidate"
  has_many :companies   , through: :groupables, source: "groupable"  ,source_type: "Company"
  has_many :users       , through: :groupables, source: "groupable"  ,source_type: "User"
  has_many :company_contacts       , through: :groupables, source: "groupable"  ,source_type: "CompanyContact"
  has_many :black_listers, as: :blacklister
  has_many   :statuses             ,as:  :statusable     ,dependent: :destroy
  has_many   :reminders            ,as:  :reminderable


  def get_blacklist_status(black_list_company_id)
    self.black_listers.find_by(company_id: black_list_company_id)&.status || 'unbanned'
  end

  def photo
    ActionController::Base.helpers.asset_path('default_logo.png')
  end

  def full_name
    group_name.to_s.titleize
  end
end
