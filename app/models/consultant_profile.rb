class ConsultantProfile < ActiveRecord::Base

  belongs_to :consultant

  validates :designation, :joining_date, :salary, :salary_type , presence: true
  validates :salary, numericality: true


end
