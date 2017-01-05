class ConsultantProfile < ActiveRecord::Base

  enum salary_type: [:salaried, :hourly]

  belongs_to :consultant

  validates :designation, :joining_date, :salary , presence: true
  validates :salary, numericality: true
  validates :salary_type , inclusion: {in: salary_types.keys}


end
