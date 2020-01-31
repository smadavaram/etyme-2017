# frozen_string_literal: true

class SellSendDocument < ApplicationRecord
  include PublicActivity::Model
  belongs_to :sell_contract, optional: true
  belongs_to :creatable, polymorphic: :true, optional: true

  has_many :document_signs, as: :documentable, dependent: :destroy
  has_many :activities, as: :trackable, class_name: 'PublicActivity::Activity', dependent: :destroy

  # include NumberGenerator.new({prefix: 'SSD', length: 7})
  before_create :set_number

  accepts_nested_attributes_for :document_signs, allow_destroy: true, reject_if: :all_blank

  def set_number
    # self.number = self.sell_contract.number
    self.number = 'SSD_' + sell_contract&.number&.split('_')[1].to_s
  end

  # def display_number
  #   "SSD"+self.number
  # end
end
