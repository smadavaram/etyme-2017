class ConsultantProfile < ActiveRecord::Base

  #Associations
  belongs_to :consultant

  #Validations
  validates :designation, :joining_date, :salary, :salary_type , presence: true
  validates :salary, numericality: true


end
