class ConsultantProfile < ApplicationRecord

  enum salary_type: [:salaried, :hourly]

  belongs_to :consultant, optional: true

  validates :designation, :joining_date, :salary , presence: true
  validates :salary, numericality: true
  validates :salary_type , inclusion: {in: salary_types.keys}


end
