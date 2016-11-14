class Role < ActiveRecord::Base

  #Associations
  has_and_belongs_to_many :permissions
  has_and_belongs_to_many :users
  # belongs_to :company

  #Validations
  validates :name,presence: true

end
