# frozen_string_literal: true

# == Schema Information
#
# Table name: educations
#
#  id              :integer          not null, primary key
#  degree_title    :string
#  grade           :string
#  completion_year :date
#  start_year      :date
#  institute       :string
#  status          :integer
#  description     :text
#  user_id         :integer
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#  degree_level    :string
#
class Education < ActiveRecord::Base
  # validates :degree_title , presence: true
  # validates :start_year ,  presence: true
  # validates :completion_year , presence: true
  # validate  :completion_year_is_greater_than_start_year
  belongs_to :candidate, class_name: 'Candidate', foreign_key: 'user_id'
  has_many :candidate_education_documents

  accepts_nested_attributes_for :candidate_education_documents, reject_if: :all_blank, allow_destroy: true

  private

  def completion_year_is_greater_than_start_year
    return unless completion_year.present?

    if completion_year < start_year
      errors.add(:completion_year, ' should be greater than start year')
      false
    else
      true
    end
  end
end
