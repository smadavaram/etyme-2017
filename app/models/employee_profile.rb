class EmployeeProfile < ActiveRecord::Base

  #Associations
  has_and_belongs_to_many :roles
  belongs_to :employee




end
