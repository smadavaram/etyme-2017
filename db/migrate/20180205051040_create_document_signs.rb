class CreateDocumentSigns < ActiveRecord::Migration[5.1]
  def change
    create_table :document_signs do |t|
      t.belongs_to :documentable, :polymorphic => true
      t.belongs_to :signable, :polymorphic => true
      t.boolean :is_sign_done, default: false
      t.datetime :sign_time

      t.timestamps
    end
  end
end
