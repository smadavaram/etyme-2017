class AddColumnRequestToSellRequestDocuments < ActiveRecord::Migration[5.1]
  def change
    add_column :sell_request_documents, :request, :string
  end
end
