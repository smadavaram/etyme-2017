# frozen_string_literal: true

# == Schema Information
#
# Table name: user_educations
#
#  id              :bigint           not null, primary key
#  user_id         :bigint
#  degree_level    :string
#  degree_title    :string
#  cgpa_grade      :string
#  completion_year :date
#  start_year      :date
#  institute       :string
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#
class UserEducation < ApplicationRecord
  belongs_to :user
end
