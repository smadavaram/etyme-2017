class CreateInvoiceItems < ActiveRecord::Migration[5.1]
  def change
    create_table :invoice_items do |t|
      t.bigint :invoice_id
      t.string :itemable_type
      t.bigint :itemable_id
    end
  end
end
