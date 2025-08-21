# frozen_string_literal: true

# == Schema Information
#
# Table name: consultant_profiles
#
#  id              :integer          not null, primary key
#  consultant_id   :integer
#  designation     :string
#  joining_date    :date
#  location_id     :integer
#  employment_type :integer
#  salary_type     :integer
#  salary          :float
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#
class ConsultantProfile < ApplicationRecord
  enum salary_type: %i[salaried hourly]

  belongs_to :consultant, optional: true

  validates :designation, :joining_date, :salary, presence: true
  validates :salary, numericality: true
  validates :salary_type, inclusion: { in: salary_types.keys }
end
