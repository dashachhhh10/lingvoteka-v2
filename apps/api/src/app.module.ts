import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { MaterialsController } from './materials.controller.js';
import { StudyController } from './study.controller.js';
import { GrammarController } from './grammar.controller.js';

@Module({ controllers: [AppController, MaterialsController, StudyController, GrammarController] })
export class AppModule {}
