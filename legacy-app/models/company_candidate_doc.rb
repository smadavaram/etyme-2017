# frozen_string_literal: true

# == Schema Information
#
# Table name: company_candidate_docs
#
#  id                    :bigint           not null, primary key
#  company_id            :integer
#  title                 :string
#  file                  :string
#  exp_date              :date
#  is_required_signature :boolean          default(FALSE)
#  created_by            :integer
#  created_at            :datetime         not null
#  updated_at            :datetime         not null
#  title_type            :string
#  is_require            :string
#  document_for          :string
#
class CompanyCandidateDoc < ApplicationRecord
  has_many :document_signs, as: :documentable, dependent: :destroy
  scope :jobs_docs, -> { where(title_type: 'Job') }
end
