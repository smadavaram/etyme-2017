# frozen_string_literal: true

# == Schema Information
#
# Table name: candidate_education_documents
#
#  id           :bigint           not null, primary key
#  education_id :integer
#  title        :string
#  file         :string
#  exp_date     :date
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#
class CandidateEducationDocument < ApplicationRecord
  belongs_to :education
end
