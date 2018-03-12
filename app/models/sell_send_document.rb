class SellSendDocument < ApplicationRecord

  belongs_to :sell_contract, optional: true
  belongs_to :creatable      , polymorphic: :true, optional: true

  has_many :document_signs       , as: :documentable

  # include NumberGenerator.new({prefix: 'SSD', length: 7})
  before_create :set_number

  accepts_nested_attributes_for :document_signs, allow_destroy: true,reject_if: :all_blank

  def set_number
    self.number = self.sell_contract.number
  end

  def display_number
    "SSD"+self.number
  end

end