class Company < ActiveRecord::Base
  belongs_to :owner , :class_name => 'User'
  belongs_to :company_type
  has_many :jobs ,through: :user
  has_many :prefferd_vendors
  has_many :vendors, through: :prefferd_vendors
end
