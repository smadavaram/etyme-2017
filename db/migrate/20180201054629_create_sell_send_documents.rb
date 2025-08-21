class CreateSellSendDocuments < ActiveRecord::Migration[4.2][5.1]
  def change
    create_table :sell_send_documents do |t|
      t.belongs_to :sell_contract
      t.string :number
      t.string :doc_file
      t.date :when_expire
      t.boolean :is_sign_required, default: false
      t.belongs_to :creatable, :polymorphic => true

      t.timestamps
    end
  end
end
