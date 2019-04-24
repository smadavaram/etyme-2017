class BlackLister < ActiveRecord::Base
  belongs_to :company, foreign_key: "company_id", class_name: 'Company'
  belongs_to :blacklister, polymorphic: true
  enum status: [:banned, :unbanned]
end