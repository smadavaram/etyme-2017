# frozen_string_literal: true

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
    if completion_year.present?
      if completion_year < start_year
        errors.add(:completion_year, ' should be greater than start year')
        false
      else
        true
      end
    end
  end
end
