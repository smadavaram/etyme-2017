# frozen_string_literal: true

module Company::InvoicesHelper
  def show_address(add)
    a = Address.where(id: add).first
  end
end
