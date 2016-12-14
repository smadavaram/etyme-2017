class Address < ActiveRecord::Base

  has_many  :locations

  validates :address_1, :city, :country, presence: true

end
