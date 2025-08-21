# frozen_string_literal: true

# == Schema Information
#
# Table name: documents
#
#  id           :bigint           not null, primary key
#  candidate_id :integer
#  title        :string
#  file         :string
#  exp_date     :date
#  is_education :boolean          default(FALSE)
#  is_legal_doc :boolean          default(FALSE)
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#
class Document < ApplicationRecord
end
