class CreateInvoiceInfos < ActiveRecord::Migration[5.1]
  def change
    create_table :invoice_infos do |t|
      t.belongs_to :company
      t.string :invoice_term
      t.timestamps
    end
  end
end