class Address < ActiveRecord::Base

  #Associations
  # has_one   :user
  has_many  :locations

  #Validation
  validates :address_1, :city, :country, presence: true


end
