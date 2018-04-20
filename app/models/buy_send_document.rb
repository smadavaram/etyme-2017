class BuySendDocument < ApplicationRecord

  belongs_to :buy_contract, optional: true
  belongs_to :creatable      , polymorphic: :true, optional: true
  has_many :document_signs       , as: :documentable,dependent: :destroy

  # include NumberGenerator.new({prefix: 'BSD', length: 7})
  before_create :set_number

  accepts_nested_attributes_for :document_signs, allow_destroy: true,reject_if: :all_blank

  def set_number
    # self.number = self.buy_contract.number
    self.number = "BSD_" + self.buy_contract.only_number.to_s
  end

  # def display_number
  #   "BSD"+self.number
  # end

end
