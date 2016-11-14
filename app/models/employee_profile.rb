class EmployeeProfile < ActiveRecord::Base

  #Associations
  belongs_to :employee

  #Validations
  validates :designation, :joining_date, :salary, :salary_type , presence: true
  validates :salary, numericality: true


end
