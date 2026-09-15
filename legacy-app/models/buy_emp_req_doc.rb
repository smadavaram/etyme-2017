# frozen_string_literal: true

# == Schema Information
#
# Table name: buy_emp_req_docs
#
#  id               :bigint           not null, primary key
#  buy_contract_id  :bigint
#  number           :string
#  doc_file         :string
#  when_expire      :date
#  is_sign_required :boolean          default(FALSE)
#  creatable_type   :string
#  creatable_id     :bigint
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#  file_name        :string
#  file_size        :integer
#  file_type        :integer
#
class BuyEmpReqDoc < ApplicationRecord
  include PublicActivity::Model
  belongs_to :buy_contract, optional: true
  belongs_to :creatable, polymorphic: :true, optional: true
  has_many :document_signs, as: :documentable, dependent: :destroy
  has_many :activities, as: :trackable, class_name: 'PublicActivity::Activity', dependent: :destroy

  # include NumberGenerator.new({prefix: 'BERD', length: 7})
  before_create :set_number

  accepts_nested_attributes_for :document_signs, allow_destroy: true, reject_if: :all_blank

  def set_number
    self.number = 'BERD_' + buy_contract&.number&.split('_')[1].to_s
  end

  # def display_number
  #   "BERD"+self.number
  # end
end
