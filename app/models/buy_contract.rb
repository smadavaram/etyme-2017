class BuyContract < ApplicationRecord

  belongs_to :contract, optional: true
  belongs_to :candidate, optional: true
  has_many :contract_buy_business_details
  has_many :contract_sale_commisions
  has_many :buy_send_documents
  has_many :buy_emp_req_docs
  has_many :buy_ven_req_docs

  # include NumberGenerator.new({prefix: 'BC', length: 7})
  before_create :set_number

  accepts_nested_attributes_for :contract_buy_business_details, allow_destroy: true,reject_if: :all_blank
  accepts_nested_attributes_for :contract_sale_commisions, allow_destroy: true,reject_if: :all_blank
  accepts_nested_attributes_for :buy_send_documents, allow_destroy: true,reject_if: :all_blank
  accepts_nested_attributes_for :buy_emp_req_docs, allow_destroy: true,reject_if: :all_blank
  accepts_nested_attributes_for :buy_ven_req_docs, allow_destroy: true,reject_if: :all_blank

  attr_accessor :ssn

  def set_number
    self.number = self.contract.number
  end

  def display_number
    "BC"+self.number
  end

  def ssn
    legacy_ssn
  end

  def ssn=(number)
    self.legacy_ssn = number
  end

  private

    def legacy_ssn
      return unless encrypted_ssn.present?
      SsnEncryption.decrypt(encrypted_ssn)
    end

    def legacy_ssn=(origin_ssn)
      return unless origin_ssn.present?
      self.encrypted_ssn = SsnEncryption.encrypt(origin_ssn)
    end

    module SsnEncryption
      extend self

      def salt
        "*I\xC6\xEF\xD3/\xF5\xC6&\xD8+\xB6\x98G\xEE\xFD\xE6&kK\xFC\xB3\xEE\x04^\xD1\xCC\v\xCC\x16h:Q\x84\xB2 \xEA\xD7i \x1E3\xEF\xDFG6@\x03\xC4\xD4\x8C\xA7\x90\x95\xF6\rB\xA4\xCF\xE8y\xD2\xC9\x89"
      end

      def key
        ActiveSupport::KeyGenerator.new("dsfdsguisd").generate_key( salt )
      end

      def encrypt(value)
        crypt = ActiveSupport::MessageEncryptor.new(key)
        crypt.encrypt_and_sign(value)
      end

      def decrypt(value)
        crypt = ActiveSupport::MessageEncryptor.new(key)
        crypt.decrypt_and_verify(value)
      end
    end

end
